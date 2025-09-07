import { Injectable } from '@angular/core';
import { Geolocation } from '@capacitor/geolocation';
import { BehaviorSubject } from 'rxjs';
import { Station } from '../models/station.model';
import { StationService } from './station.service';


@Injectable({
  providedIn: 'root'
})
export class GeolocationService {
  private currentLocation = new BehaviorSubject<{latitude: number, longitude: number} | null>(null);

  constructor(private stationService: StationService) {}









  getCurrentLocation() {
    return this.currentLocation.asObservable();
  }

  async getCurrentPosition() {
    try {
      const position = await Geolocation.getCurrentPosition();
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude
      };
    } catch (error) {
      console.error('Failed to get current position:', error);
      throw error;
    }
  }
}