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

export interface Calendar {
  service_id: string;
  monday: string;
  tuesday: string;
  wednesday: string;
  thursday: string;
  friday: string;
  saturday: string;
  sunday: string;
  start_date: string;
  end_date: string;
}

export interface CalendarDate {
  service_id: string;
  date: string; // YYYYMMDD
  exception_type: string; // 1 = added, 2 = removed 
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