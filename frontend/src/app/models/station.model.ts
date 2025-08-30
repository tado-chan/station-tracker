export interface Station {
  id: number;
  name: string;
  name_kana: string;
  latitude: number;
  longitude: number;
  polygon_data: string;
  created_at: string;
}

export interface StationVisit {
  id?: number;
  station: number;
  station_data?: Station;
  arrived_at: string;
  departed_at?: string;
  duration_minutes?: number;
  weather?: string;
  notes?: string;
  latitude: number;
  longitude: number;
}

export interface VisitStats {
  total_visits: number;
  unique_stations: number;
  avg_duration: number;
  most_visited: {
    station__name: string;
    visit_count: number;
  } | null;
}