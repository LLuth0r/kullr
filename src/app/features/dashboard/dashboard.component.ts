import { Component, inject, output, signal, OnInit } from '@angular/core';
import {
  MediaStateService,
  PlexService,
  SelectionService,
} from '../../core/services';
import { MediaItem } from '../../core/models';
import { StatsRowComponent } from './components/stats-row/stats-row.component';
import { FilterBarComponent } from './components/filter-bar/filter-bar.component';
import { MediaTableComponent } from './components/media-table/media-table.component';
import { BulkActionBarComponent } from './components/bulk-action-bar/bulk-action-bar.component';
import { DeleteModalComponent } from './components/delete-modal/delete-modal.component';
import { ToastHostComponent } from '../../shared/components/toast-host/toast-host.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    StatsRowComponent,
    FilterBarComponent,
    MediaTableComponent,
    BulkActionBarComponent,
    DeleteModalComponent,
    ToastHostComponent,
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  readonly disconnected = output<void>();

  protected readonly state = inject(MediaStateService);
  protected readonly plex = inject(PlexService);
  protected readonly selection = inject(SelectionService);

  /** Items currently fed to the modal. Empty = modal hidden. */
  readonly deleteTarget = signal<MediaItem[]>([]);

  ngOnInit(): void {
    this.state.loadLibraries();
  }

  rescan(): void {
    this.selection.clear();
    this.state.loadLibraries();
  }

  /** Switches the SPA back to the config page (renamed "Settings" in the UI). */
  disconnect(): void {
    this.selection.clear();
    this.disconnected.emit();
  }

  openDeleteFor(item: MediaItem): void {
    this.deleteTarget.set([item]);
  }

  openBulkDelete(): void {
    const items = this.selection.selectedItems();
    if (items.length === 0) return;
    this.deleteTarget.set(items);
  }

  onModalClosed(result: { refresh: boolean }): void {
    this.deleteTarget.set([]);
    if (result.refresh) {
      this.selection.clear();
      this.state.loadLibraries();
    }
  }
}
