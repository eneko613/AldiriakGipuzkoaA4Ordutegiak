import JSZip from 'jszip';
import { GIPUZKOA_STATIONS } from '../constants';
import { Calendar, CalendarDate, ParsedTrip, StopTime } from '../types';

// Helper to clean stop IDs
const cleanId = (id: string) => id.trim();

// Get date info from YYYY-MM-DD string
const getDateInfo = (isoDateStr: string) => {
  // isoDateStr comes from input type="date" value (YYYY-MM-DD)
  const [year, month, day] = isoDateStr.split('-').map(Number);
  
  // Create local date object to get day of week correctly
  // Note: month is 0-indexed in Date constructor
  const dateObj = new Date(year, month - 1, day);
  
  const yyyymmdd = `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
  const formattedDate = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;

  const dayIndex = dateObj.getDay(); // 0 is Sunday
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = days[dayIndex];

  return { dateStr: yyyymmdd, dayName, formattedDate };
};

export const parseGTFS = async (
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
          arrival_time: "", // Not needed for final output
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