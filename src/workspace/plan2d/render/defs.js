/* 2D 地面材质图案（静态，一次生成） */
export const DEFS = (() => {
  const plank = (id, base, line) => `<pattern id="m-${id}" patternUnits="userSpaceOnUse" width="1800" height="360">
      <rect width="1800" height="360" fill="${base}"/>
      <path d="M0 0H1800M0 180H1800M1200 0V180M600 180V360" stroke="${line}" stroke-width="10"/>
      <path d="M100 70Q500 60 900 85T1700 75M200 260Q700 250 1100 275T1750 262" stroke="${line}" stroke-width="5" fill="none" opacity=".45"/></pattern>`;
  const tile = (id, size, base, line) => `<pattern id="m-${id}" patternUnits="userSpaceOnUse" width="${size}" height="${size}">
      <rect width="${size}" height="${size}" fill="${base}"/><path d="M0 0H${size}M0 0V${size}" stroke="${line}" stroke-width="10"/></pattern>`;
  return plank('wood', '#dcc09a', '#bf9d70') + plank('walnut', '#a57c56', '#80593a')
    + tile('tile800', 800, '#ece7de', '#d3cabb') + tile('tile600', 600, '#e2e6e3', '#c4cbc6')
    + tile('antislip', 300, '#d6dbd7', '#b3bab4')
    + `<pattern id="m-marble" patternUnits="userSpaceOnUse" width="1200" height="1200">
      <rect width="1200" height="1200" fill="#f3f0ea"/><path d="M0 0H1200M0 0V1200" stroke="#dcd5c8" stroke-width="10"/>
      <path d="M-50 300C250 260 380 520 700 470S1100 640 1260 600M200 1200C300 950 520 980 640 820" stroke="#d6cfc2" stroke-width="12" fill="none"/></pattern>
    <pattern id="m-terrazzo" patternUnits="userSpaceOnUse" width="500" height="500">
      <rect width="500" height="500" fill="#e8e1d5"/>
      <circle cx="60" cy="80" r="22" fill="#b9a58c"/><circle cx="310" cy="140" r="16" fill="#8fa3a0"/><circle cx="190" cy="330" r="26" fill="#c9b7a2"/>
      <circle cx="420" cy="400" r="18" fill="#a88f76"/><circle cx="90" cy="440" r="12" fill="#8fa3a0"/><circle cx="440" cy="40" r="10" fill="#b9a58c"/></pattern>
    <pattern id="m-carpet" patternUnits="userSpaceOnUse" width="120" height="120">
      <rect width="120" height="120" fill="#c9c3d3"/><circle cx="30" cy="30" r="8" fill="#bab3c6"/><circle cx="90" cy="90" r="8" fill="#bab3c6"/></pattern>
    <pattern id="m-lawn" patternUnits="userSpaceOnUse" width="300" height="300">
      <rect width="300" height="300" fill="#a9c78a"/>
      <path d="M30 90l10-26 10 26M80 200l9-22 9 22M170 60l10-26 10 26M230 230l9-22 9 22M120 270l8-20 8 20M260 120l10-24 10 24"
        stroke="#87ac64" stroke-width="7" fill="none" stroke-linecap="round"/>
      <circle cx="60" cy="230" r="7" fill="#c3d9a8"/><circle cx="200" cy="150" r="7" fill="#c3d9a8"/>
      <circle cx="265" cy="45" r="6" fill="#c3d9a8"/><circle cx="115" cy="35" r="6" fill="#c3d9a8"/></pattern>
    <pattern id="m-pond" patternUnits="userSpaceOnUse" width="600" height="600">
      <rect width="600" height="600" fill="#8fc3d4"/>
      <path d="M-20 120Q80 70 180 120T400 120T640 120M-20 300Q90 250 200 300T420 300T640 300M-20 480Q80 430 180 480T400 480T640 480"
        stroke="#d6edf4" stroke-width="8" fill="none" opacity=".75"/>
      <path d="M-20 210Q80 160 180 210T400 210T640 210M-20 390Q90 340 200 390T420 390T640 390"
        stroke="#6fa8bd" stroke-width="6" fill="none" opacity=".5"/></pattern>
    <pattern id="m-asphalt" patternUnits="userSpaceOnUse" width="600" height="600">
      <rect width="600" height="600" fill="#3f3f42"/>
      <circle cx="70" cy="90" r="4" fill="#55555a"/><circle cx="210" cy="150" r="3" fill="#2e2e31"/>
      <circle cx="360" cy="70" r="3.5" fill="#505055"/><circle cx="480" cy="200" r="2.6" fill="#2b2b2e"/>
      <circle cx="130" cy="330" r="3.2" fill="#54545a"/><circle cx="300" cy="400" r="3.6" fill="#2d2d30"/>
      <circle cx="470" cy="360" r="2.8" fill="#515156"/><circle cx="60" cy="500" r="3" fill="#2c2c2f"/>
      <circle cx="260" cy="520" r="3.4" fill="#535358"/><circle cx="540" cy="510" r="2.4" fill="#2e2e31"/>
    </pattern>
    <pattern id="m-cement" patternUnits="userSpaceOnUse" width="600" height="600">
      <rect width="600" height="600" fill="#c9c6bf"/>
      <circle cx="90" cy="120" r="5" fill="#b6b3ab"/><circle cx="260" cy="60" r="3.5" fill="#d4d1ca"/>
      <circle cx="420" cy="180" r="4.5" fill="#b0ada5"/><circle cx="160" cy="380" r="4" fill="#d6d3cc"/>
      <circle cx="500" cy="430" r="5" fill="#b3b0a8"/><circle cx="320" cy="520" r="3" fill="#dedbd4"/></pattern>
    <pattern id="m-sidewalk" patternUnits="userSpaceOnUse" width="600" height="300">
      <rect width="600" height="300" fill="#d6d2c8"/>
      <path d="M0 0H600M0 150H600" stroke="#bdb7aa" stroke-width="8"/>
      <path d="M0 0V150M300 0V150M150 150V300M450 150V300" stroke="#bdb7aa" stroke-width="7"/>
      <path d="M0 12H600M0 162H600" stroke="#e6e2d9" stroke-width="3" opacity=".7"/></pattern>
    <pattern id="m-curb" patternUnits="userSpaceOnUse" width="600" height="300">
      <rect width="600" height="300" fill="#dcdad3"/>
      <path d="M0 0H600M0 150H600" stroke="#c2beb5" stroke-width="10"/>
      <path d="M300 0V150M120 150V300" stroke="#c2beb5" stroke-width="8"/>
      <path d="M0 44H600M0 194H600" stroke="#efece5" stroke-width="5" opacity=".75"/></pattern>
    <pattern id="m-hedge" patternUnits="userSpaceOnUse" width="240" height="240">
      <rect width="240" height="240" fill="#6f9455"/>
      <circle cx="60" cy="60" r="34" fill="#7fa663"/><circle cx="162" cy="102" r="30" fill="#5f8449"/>
      <circle cx="92" cy="182" r="32" fill="#749b58"/><circle cx="202" cy="204" r="26" fill="#65894e"/>
      <circle cx="192" cy="40" r="20" fill="#85ac68"/><circle cx="26" cy="150" r="18" fill="#85ac68"/></pattern>
    <pattern id="m-soil" patternUnits="userSpaceOnUse" width="400" height="400">
      <rect width="400" height="400" fill="#7a6248"/>
      <circle cx="60" cy="80" r="7" fill="#8b7256"/><circle cx="180" cy="140" r="5" fill="#634d36"/>
      <circle cx="300" cy="70" r="6" fill="#876e52"/><circle cx="120" cy="260" r="8" fill="#654f38"/>
      <circle cx="330" cy="240" r="5" fill="#8d7458"/><circle cx="250" cy="330" r="7" fill="#5f4a34"/>
      <circle cx="80" cy="350" r="4" fill="#93795c"/><circle cx="380" cy="140" r="4" fill="#63503a"/></pattern>
    <pattern id="grid" patternUnits="userSpaceOnUse" width="1000" height="1000">
      <path d="M500 0V1000M0 500H1000" stroke="#e5dfd3" stroke-width="8"/><path d="M0 0V1000M0 0H1000" stroke="#d8d0c1" stroke-width="14"/></pattern>`;
})();
