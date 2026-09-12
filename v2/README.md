# Store Runner V2

Store Runner V2 est reconstruit en parallèle de la V1. Ce dossier reste volontairement isolé de `index.html`, du service worker de production et du runtime historique.

V2-01 pose uniquement le socle de données et de stockage. Aucun écran métier n'est branché ici.

Les modules utilisent ESM natif, sans bundler, sans transpilation et sans dépendance npm. Les tests sont des scripts Node 22 autonomes.
