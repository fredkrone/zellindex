// Builds site/landlords.json: politics, property tax, tenant law -> landlord-friendliness score.
// Usage: node scanner/landlords/build.js site/landlords.json
const fs = require("fs");
const csv = fs.readFileSync(require("path").join(__dirname, "soldfast-2026.csv"), "utf8").trim().split("\n").map(l => l.split(","));
const head = csv.shift();
const idx = Object.fromEntries(head.map((h, i) => [h, i]));
const ev = Object.fromEntries(csv.map(r => [r[0], { cost: +r[idx.Potential_Eviction_Costs], speed: +r[idx.Avg_Eviction_Rates_Timelines], notice: +r[idx.Required_Notice_Periods] }]));
const AB = {Alabama:"AL",Alaska:"AK",Arizona:"AZ",Arkansas:"AR",California:"CA",Colorado:"CO",Connecticut:"CT",Delaware:"DE",Florida:"FL",Georgia:"GA",Hawaii:"HI",Idaho:"ID",Illinois:"IL",Indiana:"IN",Iowa:"IA",Kansas:"KS",Kentucky:"KY",Louisiana:"LA",Maine:"ME",Maryland:"MD",Massachusetts:"MA",Michigan:"MI",Minnesota:"MN",Mississippi:"MS",Missouri:"MO",Montana:"MT",Nebraska:"NE",Nevada:"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND",Ohio:"OH",Oklahoma:"OK",Oregon:"OR",Pennsylvania:"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD",Tennessee:"TN",Texas:"TX",Utah:"UT",Vermont:"VT",Virginia:"VA",Washington:"WA","West Virginia":"WV",Wisconsin:"WI",Wyoming:"WY"};
// Governor taking office in 2027 (2026 results; others not up). "?" = uncalled.
const GOV = {AL:"R",AK:"D",AZ:"D",AR:"R",CA:"D",CO:"D",CT:"D",DE:"D",FL:"R",GA:"D",HI:"D",ID:"R",IL:"D",IN:"R",IA:"D",KS:"?",KY:"D",LA:"R",ME:"D",MD:"D",MA:"D",MI:"D",MN:"D",MS:"R",MO:"R",MT:"R",NE:"R",NV:"D",NH:"R",NJ:"D",NM:"D",NY:"D",NC:"D",ND:"R",OH:"D",OK:"R",OR:"D",PA:"D",RI:"D",SC:"R",SD:"R",TN:"R",TX:"D",UT:"R",VT:"R",VA:"D",WA:"D",WV:"R",WI:"D",WY:"R"};
const GOVNAME = {AL:"Tommy Tuberville",AK:"Jonathan Kreiss-Tomkins",AZ:"Katie Hobbs",AR:"Sarah Huckabee Sanders",CA:"Xavier Becerra",CO:"Phil Weiser",CT:"Ned Lamont",DE:"Matt Meyer",FL:"Byron Donalds",GA:"Keisha Lance Bottoms",HI:"Josh Green",ID:"Brad Little",IL:"JB Pritzker",IN:"Mike Braun",IA:"Rob Sand",KS:"Uncalled",KY:"Andy Beshear",LA:"Jeff Landry",ME:"Hannah Pingree",MD:"Wes Moore",MA:"Maura Healey",MI:"Jocelyn Benson",MN:"Amy Klobuchar",MS:"Tate Reeves",MO:"Mike Kehoe",MT:"Greg Gianforte",NE:"Jim Pillen",NV:"Aaron Ford",NH:"Kelly Ayotte",NJ:"Mikie Sherrill",NM:"Deb Haaland",NY:"Kathy Hochul",NC:"Josh Stein",ND:"Kelly Armstrong",OH:"Amy Acton",OK:"Mike Mazzei",OR:"Tina Kotek",PA:"Josh Shapiro",RI:"Helena Foulkes",SC:"Alan Wilson",SD:"Larry Rhoden",TN:"Marsha Blackburn",TX:"Gina Hinojosa",UT:"Spencer Cox",VT:"Phil Scott",VA:"Abigail Spanberger",WA:"Bob Ferguson",WV:"Patrick Morrisey",WI:"David Crowley",WY:"Eric Barlow"};
const FLIP = {AK:1,GA:1,IA:1,NV:1,OH:1,TX:1};
// Legislature after the 2026 election: R, D, S (split/coalition)
const LEG = {AL:"R",AK:"S",AZ:"D",AR:"R",CA:"D",CO:"D",CT:"D",DE:"D",FL:"R",GA:"R",HI:"D",ID:"R",IL:"D",IN:"R",IA:"R",KS:"R",KY:"R",LA:"R",ME:"D",MD:"D",MA:"D",MI:"D",MN:"D",MS:"R",MO:"R",MT:"R",NE:"R",NV:"D",NH:"D",NJ:"D",NM:"D",NY:"D",NC:"S",ND:"R",OH:"R",OK:"R",OR:"D",PA:"D",RI:"D",SC:"R",SD:"R",TN:"R",TX:"S",UT:"R",VT:"D",VA:"D",WA:"D",WV:"R",WI:"D",WY:"R"};
// 2024 presidential margin, Trump minus Harris, points
const PRES = {AL:30.5,AK:13.1,AZ:5.5,AR:30.6,CA:-20.1,CO:-11.0,CT:-14.5,DE:-14.7,FL:13.1,GA:2.2,HI:-23.1,ID:36.5,IL:-10.9,IN:19.0,IA:13.2,KS:16.1,KY:30.5,LA:22.0,ME:-6.9,MD:-28.5,MA:-25.2,MI:1.4,MN:-4.2,MS:22.9,MO:18.4,MT:20.0,NE:20.5,NV:3.1,NH:-2.8,NJ:-5.9,NM:-6.0,NY:-12.6,NC:3.2,ND:36.5,OH:11.2,OK:34.3,OR:-14.3,PA:1.7,RI:-13.8,SC:17.8,SD:29.2,TN:29.7,TX:13.7,UT:21.6,VT:-32.3,VA:-5.8,WA:-18.2,WV:41.9,WI:0.9,WY:45.8};
// Property tax: [owner-occupied effective rate 2024 (Tax Foundation), apartment rate in largest city 2025 (Lincoln Institute)]
const TAX = {HI:[0.31,0.33],AL:[0.37,1.02],AZ:[0.43,1.12],ID:[0.43,0.86],SC:[0.44,1.77],UT:[0.45,0.45],TN:[0.46,1.11],WV:[0.48,1.82],NV:[0.50,1.11],DE:[0.51,1.83],CO:[0.52,0.46],AR:[0.54,1.36],MS:[0.54,2.91],LA:[0.56,1.26],WY:[0.58,0.63],MT:[0.59,0.50],NM:[0.61,1.46],NC:[0.62,0.69],CA:[0.69,1.19],KY:[0.72,1.03],WA:[0.74,0.85],VA:[0.75,0.69],IN:[0.76,2.19],FL:[0.76,1.65],GA:[0.77,1.61],OK:[0.78,1.37],OR:[0.79,2.61],MO:[0.85,1.52],AK:[0.90,1.35],MD:[0.90,2.33],ME:[0.90,1.20],ND:[0.94,1.31],MA:[0.95,1.02],MN:[0.99,1.65],RI:[1.00,2.22],SD:[1.00,1.51],MI:[1.13,3.70],PA:[1.14,1.21],WI:[1.19,2.05],KS:[1.20,1.25],NY:[1.23,2.49],TX:[1.24,2.04],IA:[1.25,1.71],OH:[1.28,2.27],NH:[1.35,1.32],CT:[1.36,1.63],NE:[1.38,1.85],VT:[1.40,2.30],NJ:[1.68,1.82],IL:[1.79,1.44]};
const CITY = {HI:"Honolulu",AL:"Huntsville",AZ:"Phoenix",ID:"Boise",SC:"Charleston",UT:"Salt Lake City",TN:"Nashville",WV:"Charleston",NV:"Las Vegas",DE:"Wilmington",CO:"Denver",AR:"Little Rock",MS:"Jackson",LA:"New Orleans",WY:"Cheyenne",MT:"Billings",NM:"Albuquerque",NC:"Charlotte",CA:"Los Angeles",KY:"Louisville",WA:"Seattle",VA:"Virginia Beach",IN:"Indianapolis",FL:"Jacksonville",GA:"Atlanta",OK:"Oklahoma City",OR:"Portland",MO:"Kansas City",AK:"Anchorage",MD:"Baltimore",ME:"Portland",ND:"Fargo",MA:"Boston",MN:"Minneapolis",RI:"Providence",SD:"Sioux Falls",MI:"Detroit",PA:"Philadelphia",WI:"Milwaukee",KS:"Wichita",NY:"New York City",TX:"Houston",IA:"Des Moines",OH:"Columbus",NH:"Manchester",CT:"Bridgeport",NE:"Omaha",VT:"Burlington",NJ:"Newark",IL:"Chicago"};
// Rent regulation: cap = statewide cap; local = local rent control in effect; open = not preempted, none in effect; ban = state preempts
const RENT = {CA:"cap",OR:"cap",WA:"cap",NY:"local",NJ:"local",MD:"local",MN:"local",ME:"local",AK:"open",CT:"open",DE:"open",HI:"open",IL:"open",NE:"open",NM:"open",PA:"open",RI:"open",VT:"open"};
const JUST = {NJ:1974,NH:2015,CA:2019,OR:2019,WA:2021,CO:2024,NY:2024};
const NOTES = {
  MN:"St. Paul caps rent increases at 3%, and 2023–24 state laws added a 14-day pre-filing notice for unpaid rent and limits on fees.",
  NY:"Rent stabilization covers about a million New York City units, and the 2024 Good Cause law limits evictions and large increases where it applies.",
  CA:"Statewide cap of 5% plus inflation (10% max) and just-cause eviction, with stricter local rent control in Los Angeles, San Francisco and others.",
  OR:"First statewide rent cap (2019), now 7% plus inflation up to 10%, and just-cause eviction after the first year.",
  WA:"Statewide rent cap since May 2025 (7% plus inflation, 10% max) on top of just-cause eviction.",
  NJ:"Just-cause eviction since 1974 and local rent control in more than 100 towns.",
  CO:"Just-cause eviction since 2024; local rent control is still preempted.",
  MD:"Local rent stabilization in Montgomery and Prince George's counties and Takoma Park.",
  ME:"Portland has rent stabilization; the state doesn't preempt it.",
  TX:"Rent control preempted and evictions are fast, but the property tax bill is among the highest in the country.",
  IL:"Highest homeowner property tax rate in the country; the state no longer preempts local rent control.",
  FL:"Rent control preempted, 3-day notice for unpaid rent, and the 2024 law barring squatters.",
  GA:"No statutory notice period before filing for unpaid rent; rent control preempted.",
  KS:"Governor's race uncalled as of Nov 6, 2026, with the Democrat narrowly ahead.",
  NC:"Democrats flipped the House in 2026; the Senate stayed Republican.",
  WI:"Democrats flipped both chambers in 2026 and hold the governorship.",
  NH:"Democrats flipped both chambers in 2026; Gov. Kelly Ayotte (R) was re-elected. Good cause is required to end a tenancy."
};
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const rows = Object.entries(AB).map(([name, ab]) => {
  const g = GOV[ab] === "R" ? 100 : GOV[ab] === "?" ? 50 : 0;
  const l = LEG[ab] === "R" ? 100 : LEG[ab] === "S" ? 50 : 0;
  const p = clamp((PRES[ab] + 30) / 60 * 100, 0, 100);
  const politics = 0.4 * g + 0.4 * l + 0.2 * p;
  const [own, apt] = TAX[ab];
  const blend = (own + apt) / 2;
  const rent = { cap: 0, local: 30, open: 70 }[RENT[ab]] ?? 100;
  const e = ev[name];
  const evict = ((e.cost + e.speed + e.notice) / 3 - 1) / 4 * 100;
  const jc = JUST[ab] ? 0 : 100;
  const law = 0.35 * rent + 0.45 * evict + 0.2 * jc;
  return { ab, name, gov: GOV[ab], govName: GOVNAME[ab], flip: !!FLIP[ab], leg: LEG[ab], pres: PRES[ab], politics: +politics.toFixed(1), own, apt, city: CITY[ab], taxBlend: +blend.toFixed(3), rent: RENT[ab] || "ban", justCause: JUST[ab] || null, evict: +evict.toFixed(1), evictParts: e, law: +law.toFixed(1), note: NOTES[ab] || null };
});
const lo = Math.min(...rows.map(r => r.taxBlend)), hi = Math.max(...rows.map(r => r.taxBlend));
rows.forEach(r => { r.tax = +((hi - r.taxBlend) / (hi - lo) * 100).toFixed(1); });
fs.writeFileSync(process.argv[2], JSON.stringify({ updated: "2026-11-06", states: rows }, null, 0));
const tot = r => (r.politics + r.tax + r.law) / 3;
rows.sort((a, b) => tot(b) - tot(a)).forEach((r, i) => console.log(String(i + 1).padStart(2), r.ab, tot(r).toFixed(1), "pol", r.politics.toFixed(0), "tax", r.tax.toFixed(0), "law", r.law.toFixed(0)));
