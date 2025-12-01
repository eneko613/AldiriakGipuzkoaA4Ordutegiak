export interface StationDef {
  orden: number;
  estacion: string;
  codigo: string;
}

// Ordered list from Irun  (1) to Brinkola (27)
export const GIPUZKOA_STATIONS: StationDef[] = [
  { orden: 1, estacion: "Irún", codigo: "11600" },
  { orden: 2, estacion: "Ventas de Irún", codigo: "11518" },
  { orden: 3, estacion: "Lezo-Rentería", codigo: "11516" },
  { orden: 4, estacion: "Pasaia", codigo: "11515" },
  { orden: 5, estacion: "Herrera", codigo: "11514" },
  { orden: 6, estacion: "Ategorrieta", codigo: "11513" },
  { orden: 7, estacion: "Gros", codigo: "11512" },
  { orden: 8, estacion: "San Sebastián", codigo: "11511" },
  { orden: 9, estacion: "Loiola", codigo: "11510" },
  { orden: 10, estacion: "Martutene", codigo: "11509" },
  { orden: 11, estacion: "Hernani", codigo: "11508" },
  { orden: 12, estacion: "Hernani-Centro", codigo: "11507" },
  { orden: 13, estacion: "Urnieta", codigo: "11506" },
  { orden: 14, estacion: "Andoain", codigo: "11505" },
  { orden: 15, estacion: "Andoain-Centro", codigo: "11504" },
  { orden: 16, estacion: "Villabona-Zizurkil", codigo: "11503" },
  { orden: 17, estacion: "Anoeta", codigo: "11502" },
  { orden: 18, estacion: "Tolosa-Centro", codigo: "11501" },
  { orden: 19, estacion: "Tolosa", codigo: "11500" },
  { orden: 20, estacion: "Alegia", codigo: "11409" },
  { orden: 21, estacion: "Itsasondo", codigo: "11406" },
  { orden: 22, estacion: "Ordizia", codigo: "11405" },
  { orden: 23, estacion: "Beasain", codigo: "11404" },
  { orden: 24, estacion: "Ormaiztegi", codigo: "11402" },
  { orden: 25, estacion: "Zumárraga", codigo: "11400" },
  { orden: 26, estacion: "Legazpi", codigo: "11306" },
  { orden: 27, estacion: "Bríncola", codigo: "11305" }
];