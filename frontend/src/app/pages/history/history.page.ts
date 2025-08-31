import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { StationService } from '../../services/station.service';
import { StationVisit, VisitStats } from '../../models/station.model';

@Component({
  selector: 'app-history',
  templateUrl: './history.page.html',
  styleUrls: ['./history.page.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule]
})
export class HistoryPage implements OnInit {
  visits: StationVisit[] = [];
  stats: VisitStats | null = null;
  filteredVisits: StationVisit[] = [];
  loading = false;
  Math = Math;
  
  // Filter options
  selectedPeriod = 'all';
  searchQuery = '';
  selectedStation: string | null = null;
  
  // Pagination
  currentPage = 0;
  pageSize = 20;
  
  periods = [
    { value: 'all', label: 'すべて' },
    { value: 'today', label: '今日' },
    { value: 'week', label: '今週' },
    { value: 'month', label: '今月' },
    { value: 'year', label: '今年' }
  ];

  constructor(private stationService: StationService) { }

  async ngOnInit() {
    await this.loadData();
  }

  async loadData() {
    this.loading = true;
    try {
      await Promise.all([
        this.loadVisits(),
        this.loadStats()
      ]);
    } finally {
      this.loading = false;
    }
  }

  private async loadVisits() {
    try {
      this.visits = await this.stationService.getUserVisits().toPromise() || [];
      this.filterVisits();
    } catch (error) {
      console.error('Failed to load visits:', error);
    }
  }

  private async loadStats() {
    try {
      this.stats = await this.stationService.getVisitStats().toPromise() || null;
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  }

  async onPeriodChange() {
    await this.filterByPeriod();
  }

  async onSearchInput(event: any) {
    this.searchQuery = event.target.value.toLowerCase();
    this.filterVisits();
  }

  private async filterByPeriod() {
    this.loading = true;
    
    try {
      if (this.selectedPeriod === 'all') {
        this.visits = await this.stationService.getUserVisits().toPromise() || [];
      } else {
        const { startDate, endDate } = this.getPeriodDates(this.selectedPeriod);
        this.visits = await this.stationService.getVisitsByDateRange(
          startDate.toISOString(),
          endDate.toISOString()
        ).toPromise() || [];
      }
      
      this.filterVisits();
    } catch (error) {
      console.error('Failed to filter visits:', error);
    } finally {
      this.loading = false;
    }
  }

  private getPeriodDates(period: string): { startDate: Date; endDate: Date } {
    const now = new Date();
    const endDate = new Date(now);
    let startDate: Date;

    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        startDate = new Date(0);
    }

    return { startDate, endDate };
  }

  filterVisits() {
    this.filteredVisits = this.visits.filter(visit => {
      const matchesSearch = !this.searchQuery || 
        visit.station_data?.name.toLowerCase().includes(this.searchQuery) ||
        visit.station_data?.name_kana.toLowerCase().includes(this.searchQuery) ||
        visit.notes?.toLowerCase().includes(this.searchQuery);
      
      const matchesStation = !this.selectedStation || 
        visit.station_data?.name === this.selectedStation;

      return matchesSearch && matchesStation;
    });

    // Reset pagination
    this.currentPage = 0;
  }

  getPaginatedVisits(): StationVisit[] {
    const startIndex = this.currentPage * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    return this.filteredVisits.slice(startIndex, endIndex);
  }

  hasNextPage(): boolean {
    return (this.currentPage + 1) * this.pageSize < this.filteredVisits.length;
  }

  hasPreviousPage(): boolean {
    return this.currentPage > 0;
  }

  nextPage() {
    if (this.hasNextPage()) {
      this.currentPage++;
    }
  }

  previousPage() {
    if (this.hasPreviousPage()) {
      this.currentPage--;
    }
  }

  async deleteVisit(visit: StationVisit) {
    if (!visit.id) return;
    
    try {
      await this.stationService.deleteVisit(visit.id).toPromise();
      this.visits = this.visits.filter(v => v.id !== visit.id);
      this.filterVisits();
      await this.loadStats(); // Refresh stats
    } catch (error) {
      console.error('Failed to delete visit:', error);
    }
  }

  formatDateTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatDuration(minutes?: number): string {
    if (!minutes) return '未設定';
    
    if (minutes < 60) {
      return `${minutes}分`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}時間${remainingMinutes > 0 ? remainingMinutes + '分' : ''}`;
    }
  }

  getUniqueStations(): string[] {
    const stations = new Set(
      this.visits
        .map(visit => visit.station_data?.name)
        .filter(name => name !== undefined)
    );
    return Array.from(stations).sort();
  }

  async doRefresh(event: any) {
    try {
      await this.loadData();
    } finally {
      event.target.complete();
    }
  }

  getVisitIcon(visit: StationVisit): string {
    if (visit.duration_minutes && visit.duration_minutes > 0) {
      return 'time';
    }
    return 'location';
  }

  getVisitColor(visit: StationVisit): string {
    if (!visit.duration_minutes) return 'medium';
    
    if (visit.duration_minutes < 5) return 'warning';
    if (visit.duration_minutes < 30) return 'primary';
    return 'success';
  }
}