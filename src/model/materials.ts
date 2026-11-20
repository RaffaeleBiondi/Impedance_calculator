export interface Material {
  id: string;
  name: string;
  family: string;
  type: 'core' | 'prepreg' | 'either';
  er: number;
  tand: number;
  freq: string;
  source: string;
  preset: boolean;
}

/**
 * Read-only presets. Every number below was re-read from the manufacturer
 * document named in `source` (spec 6.6). Nothing here is rounded or guessed.
 *
 * Deliberately NOT shipped: the Isola 370HR glass-style entries carried over
 * from the original page (core 1x7628 4.35/0.017, prepreg 1080 3.93/0.020,
 * prepreg 2116 4.17/0.019). The current Isola Dk/Df table (370HR, Rev I)
 * lists different numbers for those constructions, so they cannot be verified;
 * the verified table rows are shipped instead, named by construction.
 */
export const PRESETS: Material[] = [
  {
    id: 'generic-fr4',
    name: 'Generic FR4',
    family: 'Generic',
    type: 'either',
    er: 4.3,
    tand: 0.02,
    freq: 'n/a',
    source: 'Rough generic default, not from a datasheet',
    preset: true,
  },
  {
    id: 'isola-370hr-typical',
    name: 'Isola 370HR (typical)',
    family: 'Isola 370HR',
    type: 'either',
    er: 4.17,
    tand: 0.0161,
    freq: '1 GHz',
    source:
      'Isola 370HR Laminate and Prepreg data sheet, Rev C (15 Apr 2021), "Typical Values Table", ' +
      'Dk B. @ 1 GHz = 4.17 and Df B. @ 1 GHz = 0.0161 (IPC-TM-650 2.5.5.9). ' +
      'Single typical value, not per glass style or resin content.',
    preset: true,
  },
  {
    id: 'isola-370hr-core-1x7628-46',
    name: 'Isola 370HR core 1×7628 (46% resin, 0.203 mm)',
    family: 'Isola 370HR',
    type: 'core',
    er: 4.28,
    tand: 0.018,
    freq: '1 GHz',
    source:
      'Isola 370HR "Dielectric Constant (Dk) / Dissipation Factor (Df) Table", Revision I (24 Feb 2026), "Core Data", row 1x7628, 46.00% resin, Standard, 0.0080 in / 0.203 mm, ' +
      '1 GHz column: Dk 4.28, Df 0.0180.',
    preset: true,
  },
  {
    id: 'isola-370hr-prepreg-1080-61',
    name: 'Isola 370HR prepreg 1080 (61% resin)',
    family: 'Isola 370HR',
    type: 'prepreg',
    er: 3.92,
    tand: 0.02,
    freq: '1 GHz',
    source:
      'Isola 370HR "Dielectric Constant (Dk) / Dissipation Factor (Df) Table", Revision I (24 Feb 2026), "Prepreg Data", row 1080, 61.00% resin, Alternate, 0.0028 in / 0.070 mm, ' +
      '1 GHz column: Dk 3.92, Df 0.0200.',
    preset: true,
  },
  {
    id: 'isola-370hr-prepreg-2116-56',
    name: 'Isola 370HR prepreg 2116 (56% resin)',
    family: 'Isola 370HR',
    type: 'prepreg',
    er: 4.08,
    tand: 0.02,
    freq: '1 GHz',
    source:
      'Isola 370HR "Dielectric Constant (Dk) / Dissipation Factor (Df) Table", Revision I (24 Feb 2026), "Prepreg Data", row 2116, 56.00% resin, Standard, 0.0051 in / 0.130 mm, ' +
      '1 GHz column: Dk 4.08, Df 0.0200.',
    preset: true,
  },
  {
    id: 'isola-is400-typical',
    name: 'Isola IS400 (typical)',
    family: 'Isola IS400',
    type: 'either',
    er: 3.9,
    tand: 0.022,
    freq: '500 MHz',
    source:
      'Isola IS400 Laminate and Prepreg data sheet, Rev C, "Typical Values Table", ' +
      'Dk B. @ 500 MHz = 3.90 and Df B. @ 500 MHz = 0.022 (IPC-TM-650 2.5.5.9). ' +
      'Single typical value, not per glass style or resin content.',
    preset: true,
  },
  {
    id: 'rogers-ro4350b',
    name: 'Rogers RO4350B',
    family: 'Rogers RO4000',
    type: 'core',
    er: 3.66,
    tand: 0.0037,
    freq: 'Dk 8-40 GHz (design); tanδ 10 GHz',
    source:
      'Rogers RO4000 Series High Frequency Circuit Materials data sheet (PUB 92-004, rev 101916; third-party copy, ' +
      'not the Rogers site), property table: "Dielectric Constant, εr Design" = 3.66 ' +
      '(differential phase length method, 8 to 40 GHz; the process Dk is 3.48 ± 0.05 at 10 GHz and is not used for impedance work); ' +
      '"Dissipation Factor tan δ" = 0.0037 at 10 GHz/23°C (0.0031 at 2.5 GHz).',
    preset: true,
  },
  {
    id: 'rogers-ro4003c',
    name: 'Rogers RO4003C',
    family: 'Rogers RO4000',
    type: 'core',
    er: 3.55,
    tand: 0.0027,
    freq: 'Dk 8-40 GHz (design); tanδ 10 GHz',
    source:
      'Rogers RO4000 Series High Frequency Circuit Materials data sheet (PUB 92-004, rev 101916; third-party copy, ' +
      'not the Rogers site), property table: "Dielectric Constant, εr Design" = 3.55 ' +
      '(differential phase length method, 8 to 40 GHz; the process Dk is 3.38 ± 0.05 at 10 GHz and is not used for impedance work); ' +
      '"Dissipation Factor tan δ" = 0.0027 at 10 GHz/23°C (0.0021 at 2.5 GHz).',
    preset: true,
  },
  {
    id: 'megtron6-r5775k-core',
    name: 'Megtron 6 core R-5775(K), 2x2116 (0.25 mm)',
    family: 'Panasonic Megtron 6',
    type: 'core',
    er: 3.71,
    tand: 0.002,
    freq: '1 GHz',
    source:
      'Panasonic Megtron 6 data sheet No. 260630 (Jun 2026), "Specification / Laminate R-5775(K)", ' +
      'Typical Dk and Typical Df tables, row Core Type 10, 0.250 mm, cloth 2116, 2 ply, resin content 54 %, 1 GHz ' +
      '(IPC TM650-2.5.5.9). Typical values, not guaranteed. The datasheet states Df at 1 GHz only as 0.002.',
    preset: true,
  },
  {
    id: 'megtron6-r5670k-2116',
    name: 'Megtron 6 prepreg R-5670(K) 2116 (56 %)',
    family: 'Panasonic Megtron 6',
    type: 'prepreg',
    er: 3.67,
    tand: 0.002,
    freq: '1 GHz',
    source:
      'Panasonic Megtron 6 data sheet No. 260630 (Jun 2026), "Specification / Prepreg R-5670(K)", ' +
      'Typical Dk and Typical Df tables, row cloth 2116, resin content 56 %, thickness 132 um, 1 GHz ' +
      '(IPC TM650-2.5.5.9). Typical values, not guaranteed. The datasheet states Df at 1 GHz only as 0.002.',
    preset: true,
  },
];
