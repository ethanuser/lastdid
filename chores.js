'use strict';
// Ready-made chores for the add picker: [name, every N days], grouped by area.
// Anything not here can still be typed in freely.
window.CHORE_CATALOG = [
  { group: 'Kitchen', icon: 'utensils', items: [
    ['Do the dishes', 1], ['Run the dishwasher', 1], ['Empty the dishwasher', 1], ['Wipe counters', 1],
    ['Clean the stovetop', 7], ['Clean the microwave', 14], ['Clean the fridge', 30], ['Toss old leftovers', 7],
    ['Clean the oven', 90], ['Descale the kettle', 60], ['Clean the coffee maker', 30], ['Mop the kitchen floor', 7],
    ['Clean the sink', 7], ['Replace the sponge', 14], ['Clean the toaster crumbs', 30], ['Defrost the freezer', 180],
  ] },
  { group: 'Cleaning', icon: 'sparkle', items: [
    ['Sweep floors', 7], ['Vacuum', 7], ['Mop floors', 14], ['Dust surfaces', 14], ['Clean mirrors', 14],
    ['Wipe light switches and handles', 14], ['Clean windows', 90], ['Wash curtains', 180], ['Vacuum the couch', 30],
    ['Clean baseboards', 90], ['Dust ceiling fans', 60], ['Declutter a room', 30], ['Tidy up', 1],
  ] },
  { group: 'Laundry & bedding', icon: 'shirt', items: [
    ['Laundry', 7], ['Fold and put away laundry', 7], ['Change sheets', 14], ['Wash towels', 7],
    ['Wash pillows', 90], ['Wash duvet', 90], ['Flip or rotate the mattress', 90], ['Iron clothes', 14],
    ['Clean the washing machine', 30], ['Clean the dryer lint trap', 7],
  ] },
  { group: 'Bathroom', icon: 'droplet', items: [
    ['Clean bathroom', 7], ['Clean the toilet', 7], ['Clean the shower', 14], ['Wash bath mats', 14],
    ['Replace toothbrush', 90], ['Restock toilet paper', 14], ['Unclog the drain', 60], ['Wash shower curtain', 60],
  ] },
  { group: 'Trash & recycling', icon: 'trash', items: [
    ['Take out trash', 3], ['Take out recycling', 7], ['Take out compost', 4], ['Clean the trash can', 30],
    ['Put bins out for collection', 7],
  ] },
  { group: 'Groceries & meals', icon: 'cart', items: [
    ['Grocery shopping', 7], ['Meal prep', 7], ['Plan meals', 7], ['Check the pantry', 14], ['Restock water filter', 60],
  ] },
  { group: 'Plants & garden', icon: 'leaf', items: [
    ['Water plants', 4], ['Water succulents', 14], ['Fertilize plants', 30], ['Repot plants', 365], ['Mow the lawn', 7],
    ['Weed the garden', 7], ['Rake leaves', 7], ['Trim hedges', 60], ['Water the garden', 2], ['Clean gutters', 180],
  ] },
  { group: 'Pets', icon: 'paw', items: [
    ['Feed the pet', 1], ['Walk the dog', 1], ['Clean the litter box', 1], ['Change litter completely', 14],
    ['Refill pet water', 1], ['Clean the fish tank', 14], ['Clean the cage', 7], ['Brush the pet', 7], ['Bathe the pet', 30],
    ['Trim pet nails', 30], ['Flea and tick treatment', 30], ['Wash pet bed', 30], ['Vet checkup', 365],
  ] },
  { group: 'Health & self-care', icon: 'heart', items: [
    ['Work out', 2], ['Go for a run', 3], ['Stretch', 1], ['Meditate', 1], ['Take vitamins', 1], ['Floss', 1],
    ['Refill prescriptions', 30], ['Cut nails', 14], ['Get a haircut', 42], ['Dentist checkup', 182], ['Doctor checkup', 365],
    ['Eye exam', 365], ['Wash makeup brushes', 14], ['Replace contact lens case', 90], ['Weigh in', 7],
  ] },
  { group: 'Home upkeep', icon: 'wrench', items: [
    ['Replace HVAC filter', 90], ['Test smoke alarms', 30], ['Replace smoke alarm batteries', 365], ['Clean the range hood filter', 90],
    ['Flush the water heater', 365], ['Check fire extinguisher', 365], ['Clean the vacuum filter', 30], ['Clean the dehumidifier', 30],
    ['Replace water filter', 60], ['Check for leaks', 90],
  ] },
  { group: 'Car & bike', icon: 'car', items: [
    ['Wash the car', 30], ['Check tire pressure', 30], ['Oil change', 120], ['Rotate tires', 180], ['Vacuum the car', 30],
    ['Top up washer fluid', 60], ['Pump bike tires', 14], ['Oil the bike chain', 30],
  ] },
  { group: 'Money & admin', icon: 'wallet', items: [
    ['Pay rent', 30], ['Pay bills', 30], ['Check bank accounts', 7], ['Review budget', 30], ['Back up phone', 30],
    ['Back up computer', 30], ['Clear email inbox', 7], ['Update software', 30], ['Cancel unused subscriptions', 90], ['File receipts', 30],
  ] },
  { group: 'People', icon: 'phone', items: [
    ['Call family', 7], ['Text a friend', 7], ['Date night', 14], ['Write a thank-you note', 30], ['Check in on a neighbor', 30],
  ] },
];
