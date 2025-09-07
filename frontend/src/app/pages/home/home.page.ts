import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { 
  IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonCard, IonCardContent,
  IonCardHeader, IonCardTitle, IonIcon, IonItem, IonLabel, IonBadge, IonList,
  IonProgressBar, IonToggle
} from '@ionic/angular/standalone';

import { StationService } from '../../services/station.service';
import { Station, StationVisit } from '../../models/station.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButton, IonCard, IonCardContent,
    IonCardHeader, IonCardTitle, IonIcon, IonItem, IonLabel, IonBadge, IonList,
    IonProgressBar, IonToggle
  ]
})
export class HomePage implements OnInit, OnDestroy {
  
  currentLocation: { latitude: number; longitude: number } | null = null;
  nearbyStations: Station[] = [];
  todayVisits: StationVisit[] = [];
  isInitializing = false;
  
  private subscriptions: Subscription[] = [];

  constructor(
    private stationService: StationService
  ) {}

  async ngOnInit() {
    try {
      this.isInitializing = true;
      
      // Load today's visits
      await this.loadTodayVisits();
      
    } catch (error) {
      console.error('Failed to initialize home page:', error);
    } finally {
      this.isInitializing = false;
    }
  }

  ngOnDestroy() {
    this.subscriptions.forEach(sub => sub.unsubscribe());
  }


  private async loadNearbyStations(lat: number, lng: number) {
    try {
      this.nearbyStations = await this.stationService.getNearbyStations(lat, lng).toPromise() || [];
    } catch (error) {
      console.error('Failed to load nearby stations:', error);
    }
  }

  private async loadTodayVisits() {
    try {
      const today = new Date();
      const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      const endOfDay = new Date(startOfDay);
      endOfDay.setDate(endOfDay.getDate() + 1);

      this.todayVisits = await this.stationService.getVisitsByDateRange(
        startOfDay.toISOString(),
        endOfDay.toISOString()
      ).toPromise() || [];
    } catch (error) {
      console.error('Failed to load today visits:', error);
    }
  }


  // Removed old unused methods

  formatEventTime(timestamp: Date): string {
    return new Date(timestamp).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  getEventIcon(type: 'enter' | 'exit'): string {
    return type === 'enter' ? 'log-in' : 'log-out';
  }

  getEventColor(type: 'enter' | 'exit'): string {
    return type === 'enter' ? 'success' : 'warning';
  }

}