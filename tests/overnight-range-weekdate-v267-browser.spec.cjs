/* P0.1 / r27 — chaque ligne du rapport découché 3 semaines est analysée
   avec sa propre semaine par le propriétaire runtime V189. */
const {test,expect}=require('@playwright/test');
const APP_URL=process.env.STORE_RUNNER_E2E_URL||'http://127.0.0.1:4173/';

test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1,
  serviceWorkers:'block',screenshot:'only-on-failure',trace:'retain-on-failure'});

test('r27 : S2 et S3 utilisent leur weekKey réel sans ressusciter S1',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(String(error&&error.message||error)));
  await page.addInitScript(()=>{
    const RealDate=Date,now=RealDate.parse('2026-09-30T09:00:00');
    class FixedDate extends RealDate{
      constructor(...args){super(...(args.length?args:[now]))}
      static now(){return now}
    }
    window.Date=FixedDate;
  });
  await page.goto(APP_URL,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.state&&window.__chefStorage&&
    window.StoreRunnerOvernightV182&&window.StoreRunnerStoreControlsV189&&
    window.StoreRunnerRouteOptimizerV251&&window.StoreRunnerTerrainPlanningV1);
  await page.waitForTimeout(1200);

  const proof=await page.evaluate(async()=>{
    const keys=['2026-09-28','2026-10-05','2026-10-12'];
    const owner=StoreRunnerStoreControlsV189.futureOvernightAnalysis;
    const ownership=StoreRunnerOvernightV182.analyze===owner;
    const mk=(prefix,letter,lat)=>({id:prefix+letter,enseigne:'Test '+prefix+letter,
      ville:'Zone distante',adresse:'1 rue Test',dept:'99',lat,lon:1,active:true,
      priority:3,intervalDays:30,freq:'Mensuel',products:['Blanc']});
    const makePlan=(prefix,lat)=>({
      Lundi:[mk(prefix,'A',lat),mk(prefix,'C',lat+.02),mk(prefix,'B',lat+.01)],
      Mardi:[mk(prefix,'D',lat+.03)],Mercredi:[],Jeudi:[],Vendredi:[],Samedi:[]
    });
    const plans={
      '2026-09-28':makePlan('S1',49),
      '2026-10-05':makePlan('S2',49.2),
      '2026-10-12':makePlan('S3',49.4)
    };
    const allStores=Object.values(plans).flatMap(plan=>plan.Lundi.concat(plan.Mardi));
    state.profile=Object.assign({},state.profile,{baseName:'Base test',baseAddress:'Base',
      baseLat:47,baseLon:1,overnightMode:'auto',overnightMinSaving:20});
    state.settings=Object.assign({},state.settings,{weekDate:keys[0],days:['Lundi','Mardi'],
      startTime:'08:30',endTime:'23:59',visitMinutes:30,maxVisitsPerDay:4});
    state.stores=allStores;state.plan=plans[keys[0]];state.manualWeekEdits={};
    state.excluded={};state.included={};state.locks={};state.calendarEvents=[];state.appointments=[];

    const suffix=store=>{
      const id=String(store&&store.id||'BASE');
      return id==='BASE'?'BASE':id.slice(-1);
    };
    const durations=new Map([
      ['BASE>A',10],['BASE>B',20],['BASE>C',25],
      ['A>B',8],['B>C',8],['C>BASE',10],
      ['A>C',70],['C>B',70],['B>BASE',20],
      ['B>A',8],['C>A',70],['BASE>BASE',0]
    ]);
    StoreRunnerRoadMatrixV248={durationMinutes(a,b){return durations.get(suffix(a)+'>'+suffix(b))??120}};
    StoreOpeningHoursV1={
      dateForDay(){return'2026-09-30'},
      originBase(){return{id:'BASE',lat:47,lon:1}},
      scheduleRoute(route,day,appState,options){
        let current=510,previous={id:'BASE'},drive=0;const rows=[];
        for(const store of route){
          const minutes=options.travelMinutes(previous,store);
          drive+=minutes;current+=minutes;rows.push({store,travel:minutes,duration:30,wait:0});
          current+=30;previous=store;
        }
        const back=route.length?options.travelMinutes(previous,{id:'BASE'}):0;
        return{start:510,endLimit:1440,estimatedEnd:current+back,closedCount:0,
          appointmentConflicts:0,rows,returnTravel:back,driveMinutes:drive+back};
      }
    };

    const archive=Object.fromEntries(keys.map(key=>[key,{weekMonday:key,plan:plans[key],manualEdited:false}]));
    __chefStorage.setItem('chef_sector_plan_archive_v1',JSON.stringify(archive));
    __chefStorage.setItem('chef_sector_range_v1',JSON.stringify({
      start:keys[0],weeks:3,workDays:['Lundi','Mardi']
    }));

    const past=owner(plans[keys[0]],keys[0]);
    const wrongS2=owner(plans[keys[1]]);
    const correctS2=owner(plans[keys[1]],keys[1]);
    const correctS3=owner(plans[keys[2]],keys[2]);

    const calls=[];
    function capture(plan){
      const weekKey=arguments[1];
      calls.push({weekKey,argCount:arguments.length,firstId:String(plan.Lundi[0].id)});
      return owner(plan,weekKey);
    }
    StoreRunnerOvernightV182.analyze=capture;
    const result=await StoreRunnerRouteOptimizerV251.finalizeRange(state);
    StoreRunnerOvernightV182.analyze=owner;
    if(typeof __chefStorage.flush==='function')await __chefStorage.flush();
    const range=JSON.parse(__chefStorage.getItem('chef_sector_range_v1'));

    return{
      ownership,captureArity:capture.length,result,calls,
      pastCandidate:past.candidate,
      wrongS2:{reason:wrongS2.reason,candidate:wrongS2.candidate},
      correctS2:correctS2.candidate&&{fromDate:correctS2.candidate.fromDate,toDate:correctS2.candidate.toDate},
      correctS3:correctS3.candidate&&{fromDate:correctS3.candidate.fromDate,toDate:correctS3.candidate.toDate},
      report:range.overnightReport.map(row=>({weekKey:row.weekKey,selected:row.selected,
        fromDate:row.best&&row.best.fromDate,toDate:row.best&&row.best.toDate}))
    };
  });

  expect(proof.ownership,'V189 doit posséder StoreRunnerOvernightV182.analyze après boot').toBe(true);
  expect(proof.captureArity,'un analyseur V182 à un paramètre reste compatible').toBe(1);
  expect(proof.result.changed).toBe(true);
  expect(proof.calls).toEqual([
    {weekKey:'2026-09-28',argCount:2,firstId:'S1A'},
    {weekKey:'2026-10-05',argCount:2,firstId:'S2A'},
    {weekKey:'2026-10-12',argCount:2,firstId:'S3A'}
  ]);

  expect(proof.pastCandidate,'aucune nuit passée de S1 ne doit être ressuscitée').toBeNull();
  expect(proof.wrongS2.candidate,'la reproduction r26 replie S2 sur la semaine affichée passée').toBeNull();
  expect(proof.wrongS2.reason).toBe('no-future-pair');
  expect(proof.correctS2).toEqual({fromDate:'2026-10-05',toDate:'2026-10-06'});
  expect(proof.correctS3).toEqual({fromDate:'2026-10-12',toDate:'2026-10-13'});
  expect(proof.report).toEqual([
    {weekKey:'2026-09-28',selected:false,fromDate:null,toDate:null},
    {weekKey:'2026-10-05',selected:true,fromDate:'2026-10-05',toDate:'2026-10-06'},
    {weekKey:'2026-10-12',selected:true,fromDate:'2026-10-12',toDate:'2026-10-13'}
  ]);

  await page.waitForTimeout(250);
  expect(errors).toEqual([]);
});
