import { Component, inject } from '@angular/core';
import { MediaStateService, FormatService } from '../../../../core/services';
import { FileSizePipe } from '../../../../shared/pipes/file-size.pipe';

@Component({
  selector: 'app-stats-row',
  standalone: true,
  imports: [FileSizePipe],
  template: `
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-label">Total Media</div>
        <div class="stat-value">{{ state.stats().totalItems }}</div>
        <div class="stat-sub">{{ state.stats().totalSize | fileSize }}</div>
      </div>

      <div class="stat-card" style="--card-accent: var(--red)">
        <div class="stat-label">Never Watched</div>
        <div class="stat-value">{{ state.stats().neverWatched }}</div>
        <div class="stat-sub">{{ state.stats().neverWatchedSize | fileSize }}</div>
      </div>

      <div class="stat-card" style="--card-accent: var(--orange)">
        <div class="stat-label">Stale (6mo+)</div>
        <div class="stat-value">{{ state.stats().staleCount }}</div>
        <div class="stat-sub">{{ state.stats().staleSize | fileSize }}</div>
      </div>

      <div class="stat-card" style="--card-accent: var(--accent)">
        <div class="stat-label">Reclaimable</div>
        <div class="stat-value">{{ state.stats().reclaimable | fileSize }}</div>
        <div class="stat-sub">{{ state.stats().reclaimablePct.toFixed(1) }}% of library</div>
      </div>

      @if (state.stats().discrepancyCount > 0) {
        <div class="stat-card" style="--card-accent: #a855f7">
          <div class="stat-label">Discrepancies</div>
          <div class="stat-value">{{ state.stats().discrepancyCount }}</div>
          <div class="stat-sub">Plex ↔ Tautulli mismatch</div>
        </div>
      }
    </div>
  `,
  styleUrl: './stats-row.component.scss',
})
export class StatsRowComponent {
  protected readonly state = inject(MediaStateService);
}
