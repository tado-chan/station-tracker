import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Station, StationVisit, VisitStats } from '../models/station.model';

@Injectable({
  providedIn: 'root'
})
export class StationService {
  private apiUrl = 'http://127.0.0.1:8000/api';

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      'Content-Type': 'application/json',
      // Add authentication headers if needed
    });
  }

  // Station endpoints
  getAllStations(): Observable<Station[]> {
    return this.http.get<Station[]>(`${this.apiUrl}/stations/`, {
      headers: this.getHeaders()
    });
  }

  getStation(id: number): Observable<Station> {
    return this.http.get<Station>(`${this.apiUrl}/stations/${id}/`, {
      headers: this.getHeaders()
    });
  }

  getNearbyStations(lat: number, lng: number): Observable<Station[]> {
    return this.http.get<Station[]>(`${this.apiUrl}/stations/?lat=${lat}&lng=${lng}`, {
      headers: this.getHeaders()
    });
  }

  // Visit endpoints
  getUserVisits(): Observable<StationVisit[]> {
    return this.http.get<StationVisit[]>(`${this.apiUrl}/visits/`, {
      headers: this.getHeaders()
    });
  }

  createVisit(visit: Partial<StationVisit>): Observable<StationVisit> {
    return this.http.post<StationVisit>(`${this.apiUrl}/visits/`, visit, {
      headers: this.getHeaders()
    });
  }

  updateVisit(id: number, visit: Partial<StationVisit>): Observable<StationVisit> {
    return this.http.patch<StationVisit>(`${this.apiUrl}/visits/${id}/`, visit, {
      headers: this.getHeaders()
    });
  }

  deleteVisit(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/visits/${id}/`, {
      headers: this.getHeaders()
    });
  }

  getVisitStats(): Observable<VisitStats> {
    return this.http.get<VisitStats>(`${this.apiUrl}/visits/stats/`, {
      headers: this.getHeaders()
    });
  }

  // Authentication endpoints
  register(userData: {
    username: string;
    email: string;
    password: string;
    first_name?: string;
    last_name?: string;
  }): Observable<any> {
    return this.http.post(`${this.apiUrl}/accounts/register/`, userData);
  }

  login(credentials: { username: string; password: string }): Observable<any> {
    return this.http.post(`${this.apiUrl}/accounts/login/`, credentials);
  }

  // Utility methods
  searchStations(query: string): Observable<Station[]> {
    return this.http.get<Station[]>(`${this.apiUrl}/stations/?search=${encodeURIComponent(query)}`, {
      headers: this.getHeaders()
    });
  }

  getVisitsByStation(stationId: number): Observable<StationVisit[]> {
    return this.http.get<StationVisit[]>(`${this.apiUrl}/visits/?station=${stationId}`, {
      headers: this.getHeaders()
    });
  }

  getVisitsByDateRange(startDate: string, endDate: string): Observable<StationVisit[]> {
    return this.http.get<StationVisit[]>(
      `${this.apiUrl}/visits/?arrived_at__gte=${startDate}&arrived_at__lte=${endDate}`,
      { headers: this.getHeaders() }
    );
  }
}