import React, { useState, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import JSZip from 'jszip';
import { Upload, FileText, AlertCircle, Train, CheckCircle, CalendarDays } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// --- TYPES ---

export interface StationDef {
  orden: number;
  estacion: string;
  codigo: string;
}

export interface Trip {
  trip_id: string;
  route_id: string;
  service_id: string;
  direction_id?: string;
}

export interface StopTime {
  trip_id: string;
  arrival_time: string;
  departure_time: string;
  stop_id: string;
  stop_sequence: number;
}

export interface ParsedTrip {
  id: string;
  stops: Record<string, string>; // stationCode -> departureTime
  firstStopOrder: number;
  lastStopOrder: number;
  departureFromOrigin: string; // Used for sorting
}

export interface ProcessingStatus {
  step: 'idle' | 'reading' | 'processing' | 'generating' | 'done' | 'error';
  message: string;
}

// --- CONSTANTS ---

// Ordered list from Irun (1) to Brinkola (27)
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

// --- UTILS: GTFS PARSER ---

const cleanId = (id: string) => id.trim();

// Get date info from YYYY-MM-DD string
const getDateInfo = (isoDateStr: string) => {
  const [year, month, day] = isoDateStr.split('-').map(Number);
  
  // Create local date object
  const dateObj = new Date(year, month - 1, day);
  
  const yyyymmdd = `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
  const formattedDate = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;

  const dayIndex = dateObj.getDay(); // 0 is Sunday
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = days[dayIndex];

  return { dateStr: yyyymmdd, dayName, formattedDate };
};

const parseGTFS = async (
  file: File, 
  selectedDateStr: string,
  onProgress: (msg: string) => void
): Promise<{ toBrinkola: ParsedTrip[], toIrun: ParsedTrip[], dateUsed: string }> => {
  
  const { dateStr, dayName, formattedDate } = getDateInfo(selectedDateStr);
  
  onProgress(`Filtrando para fecha: ${formattedDate} (${dayName})...`);
  const zip = new JSZip();
  const content = await zip.loadAsync(file);

  const readFile = async (filename: string) => {
    if (!content.files[filename]) return null;
    return await content.files[filename].async("string");
  };

  // 1. Identify relevant stop IDs
  const validStopCodes = new Set(GIPUZKOA_STATIONS.map(s => s.codigo));
  const codeToOrder = new Map(GIPUZKOA_STATIONS.map(s => [s.codigo, s.orden]));

  // 2. Determine Valid Service IDs for SELECTED DATE
  onProgress("Analizando calendario y excepciones...");
  const activeServices = new Set<string>();

  // 2a. Check calendar.txt (Base schedule)
  const calendarTxt = await readFile("calendar.txt");
  if (calendarTxt) {
    const lines = calendarTxt.split('\n');
    const headers = lines[0].trim().split(',');
    
    // Dynamic column mapping
    const idx = {
      service: headers.indexOf('service_id'),
      day: headers.indexOf(dayName), // monday, tuesday, etc.
      start: headers.indexOf('start_date'),
      end: headers.indexOf('end_date'),
    };

    if (idx.service !== -1 && idx.day !== -1 && idx.start !== -1 && idx.end !== -1) {
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(',');
        
        const serviceId = cols[idx.service];
        const isActiveDay = cols[idx.day] === '1';
        const startDate = cols[idx.start];
        const endDate = cols[idx.end];

        // Check date range
        if (isActiveDay && dateStr >= startDate && dateStr <= endDate) {
          activeServices.add(serviceId);
        }
      }
    }
  }

  // 2b. Check calendar_dates.txt (Exceptions: Additions/Removals)
  const calendarDatesTxt = await readFile("calendar_dates.txt");
  if (calendarDatesTxt) {
    const lines = calendarDatesTxt.split('\n');
    const headers = lines[0].trim().split(',');
    const idx = {
      service: headers.indexOf('service_id'),
      date: headers.indexOf('date'),
      type: headers.indexOf('exception_type'), // 1 = added, 2 = removed
    };

    if (idx.service !== -1 && idx.date !== -1 && idx.type !== -1) {
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(',');

        // Only care about exceptions for SELECTED DATE
        if (cols[idx.date] === dateStr) {
          const type = cols[idx.type];
          const serviceId = cols[idx.service];

          if (type === '1') {
            activeServices.add(serviceId); // Force add
          } else if (type === '2') {
            activeServices.delete(serviceId); // Force remove
          }
        }
      }
    }
  }

  if (activeServices.size === 0) {
    throw new Error(`No se encontraron servicios activos para la fecha ${formattedDate}.`);
  }

  // 3. Filter Trips based on Active Services
  onProgress(`Procesando viajes activos (${activeServices.size} servicios)...`);
  const tripsTxt = await readFile("trips.txt");
  if (!tripsTxt) throw new Error("No se encontró trips.txt");
  
  const tripServiceMap = new Map<string, string>(); // trip_id -> service_id
  const activeTrips = new Set<string>(); // Set of trip_ids that run today

  const tripsLines = tripsTxt.split('\n');
  const tripsHeader = tripsLines[0].trim().split(',');
  const tIdx = {
    trip: tripsHeader.indexOf('trip_id'),
    service: tripsHeader.indexOf('service_id'),
  };

  for (let i = 1; i < tripsLines.length; i++) {
    const line = tripsLines[i];
    if (!line) continue;
    const cols = line.split(',');
    const tripId = cols[tIdx.trip];
    const serviceId = cols[tIdx.service];
    
    if (activeServices.has(serviceId)) {
      activeTrips.add(tripId);
      tripServiceMap.set(tripId, serviceId);
    }
  }

  // 4. Read Stop Times (only for active trips)
  onProgress("Leyendo horarios...");
  const stopTimesTxt = await readFile("stop_times.txt");
  if (!stopTimesTxt) throw new Error("No se encontró stop_times.txt");

  const tripStops = new Map<string, StopTime[]>();
  
  const stLines = stopTimesTxt.split('\n');
  const stHeaders = stLines[0].trim().split(',');
  const stIdx = {
    trip: stHeaders.indexOf('trip_id'),
    dep: stHeaders.indexOf('departure_time'),
    stop: stHeaders.indexOf('stop_id'),
    seq: stHeaders.indexOf('stop_sequence'),
  };

  for (let i = 1; i < stLines.length; i++) {
    const line = stLines[i];
    if (!line) continue;
    const cols = line.split(','); 
    
    const tripId = cols[stIdx.trip];
    
    // Optimized filter: only process if trip is active today
    if (activeTrips.has(tripId)) {
      const stopId = cleanId(cols[stIdx.stop]);
      
      // And only if it's one of our stations
      if (validStopCodes.has(stopId)) {
        if (!tripStops.has(tripId)) {
          tripStops.set(tripId, []);
        }
        tripStops.get(tripId)?.push({
          trip_id: tripId,
          arrival_time: "", 
          departure_time: cols[stIdx.dep],
          stop_id: stopId,
          stop_sequence: parseInt(cols[stIdx.seq])
        });
      }
    }
  }

  // 5. Build Result Arrays
  onProgress("Organizando direcciones...");
  const toBrinkola: ParsedTrip[] = [];
  const toIrun: ParsedTrip[] = [];

  tripStops.forEach((stops, tripId) => {
    // Sort stops by sequence
    stops.sort((a, b) => a.stop_sequence - b.stop_sequence);

    if (stops.length < 2) return;

    const firstStop = stops[0];
    const lastStop = stops[stops.length - 1];

    const firstOrder = codeToOrder.get(firstStop.stop_id);
    const lastOrder = codeToOrder.get(lastStop.stop_id);

    if (firstOrder === undefined || lastOrder === undefined) return;

    const stopsMap: Record<string, string> = {};
    stops.forEach(s => {
      // Format time: HH:MM:SS -> HH:MM
      const time = s.departure_time.substring(0, 5);
      stopsMap[s.stop_id] = time;
    });

    const parsedTrip: ParsedTrip = {
      id: tripId,
      stops: stopsMap,
      firstStopOrder: firstOrder,
      lastStopOrder: lastOrder,
      departureFromOrigin: firstStop.departure_time
    };

    // Determine direction
    if (firstOrder < lastOrder) {
      toBrinkola.push(parsedTrip);
    } else {
      toIrun.push(parsedTrip);
    }
  });

  // Sort trips by departure time
  const timeCompare = (a: ParsedTrip, b: ParsedTrip) => a.departureFromOrigin.localeCompare(b.departureFromOrigin);
  toBrinkola.sort(timeCompare);
  toIrun.sort(timeCompare);

  return { toBrinkola, toIrun, dateUsed: formattedDate };
};

// --- UTILS: PDF GENERATOR ---

const generatePDF = (toBrinkola: ParsedTrip[], toIrun: ParsedTrip[], dateStr: string) => {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  // Safe access for autoTable in ESM/Browser environment
  const autoTableFunc = (autoTable as any).default || autoTable;

  const generateTable = (title: string, trips: ParsedTrip[], stations: StationDef[]) => {
    const headRow = stations.map(s => s.estacion);
    
    const bodyRows = trips.map(trip => {
      const row: string[] = [];
      stations.forEach(st => {
        const time = trip.stops[st.codigo];
        row.push(time || '-');
      });
      return row;
    });

    if (doc.getNumberOfPages() > 1 || (doc.getCurrentPageInfo().pageNumber === 1 && (doc as any).lastAutoTable)) {
      doc.addPage();
    }

    doc.setFontSize(14);
    doc.text(title, 14, 15);
    doc.setFontSize(10);
    doc.text(`Fecha de circulación: ${dateStr}`, 14, 20);

    autoTableFunc(doc, {
      startY: 25,
      head: [headRow],
      body: bodyRows,
      theme: 'grid',
      styles: {
        fontSize: 6,
        cellPadding: 0.5,
        halign: 'center',
        valign: 'middle',
        lineWidth: 0.1,
        lineColor: [200, 200, 200]
      },
      headStyles: {
        fillColor: [227, 6, 19], // Renfe Red
        textColor: [255, 255, 255],
        fontSize: 5.5,
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
        cellPadding: 1
      },
      margin: { top: 25, left: 5, right: 5 },
    });
  };

  // 1. Irun -> Brinkola
  const stationsToBrinkola = [...GIPUZKOA_STATIONS];
  generateTable("Horarios: Irun -> Brinkola", toBrinkola, stationsToBrinkola);

  // 2. Brinkola -> Irun
  const stationsToIrun = [...GIPUZKOA_STATIONS].reverse();
  generateTable("Horarios: Brinkola -> Irun", toIrun, stationsToIrun);

  doc.save(`Cercanias_Gipuzkoa_${dateStr.replace(/\//g, '-')}.pdf`);
};

// --- MAIN APP COMPONENT ---

const App: React.FC = () => {
  const [status, setStatus] = useState<ProcessingStatus>({ step: 'idle', message: '' });
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<{ toBrinkola: ParsedTrip[], toIrun: ParsedTrip[], dateUsed: string } | null>(null);
  
  // Initialize with today's date in local time YYYY-MM-DD
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus({ step: 'idle', message: '' });
      setData(null);
    }
  };

  const handleProcess = async () => {
    if (!file) return;

    try {
      setStatus({ step: 'reading', message: 'Iniciando lectura del archivo...' });
      
      const result = await parseGTFS(file, selectedDate, (msg) => {
        setStatus({ step: 'processing', message: msg });
      });

      setData(result);
      setStatus({ step: 'done', message: 'Procesamiento completado con éxito.' });
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      setStatus({ step: 'error', message: `Error: ${msg}` });
    }
  };

  const handleDownload = () => {
    if (!data) return;
    setStatus({ step: 'generating', message: 'Generando PDF...' });
    setTimeout(() => {
        try {
            generatePDF(data.toBrinkola, data.toIrun, data.dateUsed);
            setStatus({ step: 'done', message: 'PDF Descargado.' });
        } catch (e) {
            console.error(e);
            setStatus({ step: 'error', message: 'Error generando PDF.' });
        }
    }, 100);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-3xl w-full space-y-8 bg-white p-10 rounded-xl shadow-lg border-t-8 border-renfe-cercanias">
        
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-renfe-cercanias text-white flex items-center justify-center rounded-full">
            <Train size={32} />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Horarios Cercanías Gipuzkoa
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Generador de PDF personalizado por fecha.
          </p>
        </div>

        <div className="mt-8 space-y-6">
          
          {/* Date Selection */}
          <div className="w-full">
            <label htmlFor="date" className="block text-sm font-medium text-gray-700 mb-2">
              Fecha de circulación
            </label>
            <div className="relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                <CalendarDays size={20} />
              </div>
              <input
                type="date"
                id="date"
                name="date"
                required
                value={selectedDate}
                onChange={(e) => {
                  setSelectedDate(e.target.value);
                  setData(null); // Reset data when date changes
                  setStatus({ step: 'idle', message: '' });
                }}
                className="focus:ring-renfe-primary focus:border-renfe-primary block w-full pl-10 sm:text-sm border-gray-300 rounded-md py-3 border px-4"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">Selecciona el día para el que quieres generar el horario.</p>
          </div>

          {/* File Upload Section */}
          <div className="w-full">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Archivo GTFS (.zip)
            </label>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md cursor-pointer transition-colors
                ${file ? 'border-renfe-primary bg-purple-50' : 'border-gray-300 hover:border-renfe-secondary'}`}
            >
              <div className="space-y-1 text-center">
                <Upload className={`mx-auto h-12 w-12 ${file ? 'text-renfe-primary' : 'text-gray-400'}`} />
                <div className="flex text-sm text-gray-600 justify-center">
                  <span className="relative font-medium text-renfe-primary hover:text-renfe-secondary">
                    {file ? file.name : "Sube el archivo fomento_transit.zip"}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  Formato ZIP requerido
                </p>
              </div>
            </div>
            <input 
              type="file" 
              ref={fileInputRef}
              className="hidden" 
              accept=".zip" 
              onChange={handleFileChange}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleProcess}
              disabled={!file || status.step === 'processing' || status.step === 'reading'}
              className={`w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white 
                ${!file ? 'bg-gray-300 cursor-not-allowed' : 'bg-renfe-primary hover:bg-renfe-secondary focus:ring-2 focus:ring-offset-2 focus:ring-renfe-primary'}
                transition-all shadow-sm`}
            >
               {status.step === 'processing' || status.step === 'reading' ? 'Filtrando y Procesando...' : '1. Procesar Datos'}
            </button>

            <button
              onClick={handleDownload}
              disabled={!data || status.step === 'generating'}
              className={`w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white 
                ${!data ? 'bg-gray-300 cursor-not-allowed' : 'bg-gray-800 hover:bg-gray-900 focus:ring-2 focus:ring-offset-2 focus:ring-gray-900'}
                transition-all shadow-sm`}
            >
               {status.step === 'generating' ? 'Generando...' : '2. Descargar PDF'}
            </button>
          </div>

          {/* Status Messages */}
          {status.message && (
            <div className={`rounded-md p-4 flex items-start ${
              status.step === 'error' ? 'bg-red-50 text-red-800' : 
              status.step === 'done' ? 'bg-green-50 text-green-800' : 'bg-blue-50 text-blue-800'
            }`}>
              <div className="flex-shrink-0">
                {status.step === 'error' ? <AlertCircle size={20} /> : 
                 status.step === 'done' ? <CheckCircle size={20} /> : <FileText size={20} />}
              </div>
              <div className="ml-3 text-sm font-medium">
                {status.message}
              </div>
            </div>
          )}

          {/* Preview Statistics */}
          {data && status.step === 'done' && (
            <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Resumen para el {data.dateUsed}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-white p-4 rounded shadow-sm border-l-4 border-renfe-cercanias">
                  <div className="text-sm text-gray-500">Irun &rarr; Brinkola</div>
                  <div className="text-2xl font-bold text-gray-800">{data.toBrinkola.length} trenes</div>
                </div>
                <div className="bg-white p-4 rounded shadow-sm border-l-4 border-renfe-primary">
                  <div className="text-sm text-gray-500">Brinkola &rarr; Irun</div>
                  <div className="text-2xl font-bold text-gray-800">{data.toIrun.length} trenes</div>
                </div>
              </div>
            </div>
          )}
          
          <div className="border-t border-gray-200 pt-6">
             <p className="text-xs text-gray-400 text-center">
                Instrucciones: El PDF generado contendrá únicamente los trenes que circulan en la fecha indicada, teniendo en cuenta festivos y excepciones del operador.
             </p>
          </div>

        </div>
      </div>
    </div>
  );
};

// --- MOUNT ---

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);