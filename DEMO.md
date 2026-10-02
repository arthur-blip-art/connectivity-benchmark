# Démo : trois parcours, moins de deux minutes chacun

Avant d'enregistrer :

```bash
cd ~/Documents/Corpo/chift-benchmark && npm run reset && npm run dev
```

Puis ouvrir `http://localhost:3210`. `npm run reset` vide les leads de test. Les chiffres ci-dessous sortent de
`npx tsx collector/scenarios.ts pleo.io:FR,BE mooncard.co:DE,BE n26.com:DE qonto.com:DE` : relance-la si les données changent.

## La phrase d'ouverture

« connect-compta, l'annuaire de Chift, répond à la question du comptable : quels outils se connectent à mon logiciel ?
Cet outil pose la question inverse, celle de l'éditeur : à quels logiciels comptables mes concurrents sont-ils
connectés, pays par pays, et pas moi ? 159 acteurs, 9 verticales, les 10 pays du livre blanc de Chift. »

## Parcours 1 : le client existant (Pleo, notes de frais)

Lien : `http://localhost:3210/?domain=pleo.io&countries=FR,BE`

1. La page s'ouvre sur la ligne de Pleo, comparée aux 7 autres éditeurs de notes de frais actifs en France.
   France : **28/100**, moyenne des concurrents 37.
2. Les manques : Cegid Quadra (6 concurrents sur 7), Pennylane (4 sur 7), Sage 100 (6 sur 7).
3. Cliquer sur Belgique : 21/100. Montrer la matrice : presque tout le monde s'arrête à Exact Online et Odoo.
4. Formulaire : `sam.demo@pleo.io`, rôle `CPO`, cocher le consentement.
5. Ouvrir `/internal` dans un autre onglet : route « CSM alert ».

À dire : « Pleo est client de Chift. Le test "client existant" passe avant tout score : l'alerte part au CSM, pas en
prospection. Un client qui regarde un nouveau pays, c'est une vente additionnelle. »

## Parcours 2 : l'éditeur en retard en Allemagne (Mooncard)

Lien : `http://localhost:3210/?domain=mooncard.co&countries=DE,BE`

1. Allemagne : **8/100**, moyenne des concurrents 33. « DATEV : vos 9 concurrents actifs ici l'ont tous. »
2. Survoler la case Pleo × DATEV : source, date, lien vers la fiche du DATEV-Marktplatz.
3. Formulaire : `lea.demo@mooncard.co`, rôle `Head of Partnerships`.
4. Dans le rapport, cliquer sur « Talk to a Chift expert ».
5. `/internal` : route « AE alert + CRM », message Slack en trois lignes, fiche CRM simulée.

À dire : « Le commercial reçoit l'entreprise, les pays et les manques. Il valide avant tout contact. »

## Parcours 3 : une autre verticale (N26 Business, banque)

Lien : `http://localhost:3210/?domain=n26.com&countries=DE`

1. Le sélecteur passe tout seul sur « Business banking » : N26 n'est comparé qu'aux banques actives en Allemagne.
2. Allemagne : **0/100**, moyenne des concurrents 45. DATEV : **6 concurrents sur 6** l'ont (Qonto, Finom, bunq, Tide,
   Holvi, Kontist). sevdesk : 5 sur 6, Lexware Office : 4 sur 6.
3. Comparer avec Qonto dans la matrice : 71/100 en Allemagne.

À dire : « Même outil, autre verticale. N26 est allemand, et c'est la seule banque de la liste sans DATEV. Le zéro veut
dire "aucune page publique trouvée" : on a lu 13 pages de N26, offres Business et centre d'aide compris. »

## En bonus : un domaine hors base

Taper `finway.de` puis « Show my gaps » : l'outil lit sa page intégrations en direct, avec la mention « Automated read,
not reviewed ». Essayer ensuite `prenom@gmail.com` dans le formulaire : refus, avec un message clair.

## Les constats à citer

- **Caisse, France** : presque toute la matrice est verte, c'est-à-dire connectée via Chift (donnée connect-compta).
- **Belgique** : la plupart des éditeurs s'arrêtent à Exact Online et Odoo. Octopus, WinBooks, Yuki, Sage BOB 50 et
  Horus restent peu couverts.
- **Spendesk** affiche « Developed by: Spendesk via Chift » sur ses fiches Sage 100, Odoo, Exact Online et ACD.

## D'où vient la donnée, en trente secondes

« Les logiciels qui comptent dans chaque pays viennent du livre blanc de Chift, 1 400 entreprises sondées. Les
connexions en France viennent de connect-compta. Ailleurs, je les ai lues sur les pages publiques des éditeurs, et
une partie est confirmée sur la marketplace du logiciel lui-même. Peppol sert de second avis : en Belgique, j'ai tiré
43 000 numéros d'entreprise au hasard. Horus y sort 4e, alors que le livre blanc dit l'avoir remonté à la main parce
que son échantillon penche vers la Flandre. »

Limite à dire soi-même : Peppol mesure où arrivent les factures, pas quel logiciel tient la comptabilité. Le livre
blanc ne donne pas de chiffre par logiciel, l'outil n'affiche donc que des niveaux.

## Ce qui est simulé ou pas encore fait

- Slack, CRM et email : stockés et affichés dans `/internal`, rien n'est envoyé.
- Enrichissement : effectifs tirés d'estimations publiques, avec leur source.
- Relecture automatique : 624 connexions déclarées par les éditeurs relues à leur source, avec citation. 595 tiennent,
  13 retirées, 16 corrigées sur le type. 35 restent non relues : 4 pages derrière une protection anti-robot (non
  contournée) et 31 trouvées le 2 octobre en lisant dans un navigateur les pages qui refusaient la lecture automatique
  (Revolut Business, Finom, Holvi…). Les fiches connect-compta sont prises telles que Chift les publie.
- Paie : les connecteurs de paie (Factorial, Skello vers Sage 100 Paie, a3innuva Nómina, etc.) ne comptent pas comme
  connexions comptables (Factorial, Skello, Personio). Choix écrit dans `collector/overrides.csv`, réversible.
- Relecture humaine : pas faite. La page l'écrit.
