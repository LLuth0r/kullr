import { Component, input, output, inject, computed } from '@angular/core';
import { MediaItem } from '../../../../core/models';
import {
  FormatService,
  SelectionService,
  ConfigService,
  ToastService,
} from '../../../../core/services';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { ProgressBarComponent } from '../../../../shared/components/progress-bar/progress-bar.component';
import { SeasonDetailComponent } from '../season-detail/season-detail.component';
import { FileSizePipe } from '../../../../shared/pipes/file-size.pipe';

@Component({
  selector: 'app-media-row',
  standalone: true,
  imports: [BadgeComponent, ProgressBarComponent, SeasonDetailComponent, FileSizePipe],
  template: `
    <div class="row-wrapper">
      <div
        class="media-row"
        [class.clickable]="isShow()"
        [class.expanded]="expanded()"
        [class.has-discrepancy]="hasDiscrepancy()"
        [class.is-selected]="isSelected()"
      >
        <div class="select-cell" (click)="onSelectCellClick($event)">
          <input
            type="checkbox"
            [checked]="isSelected()"
            [disabled]="!canSelect()"
            (change)="onToggleSelect()"
            [title]="canSelect() ? 'Select for bulk action' : 'Click for why this item is blocked'"
          />
        </div>

        <div
          class="title-cell"
          (click)="onTitleClick()"
        >
          @if (isShow()) {
            <span class="expand-arrow" [class.open]="expanded()">▶</span>
          }
          <div class="title-text">
            <span class="media-title">{{ item().title }}</span>
            @if (item().year) {
              <span class="media-year">({{ item().year }})</span>
            }
            @if (arrConfigured() && item().arr?.matched) {
              <span class="arr-tag">{{ item().arr!.instanceName }}</span>
            }
          </div>
        </div>

        <div class="dual-status">
          <app-badge [info]="staleness()" />
          @if (item().plex) {
            <span class="plex-state" [class.watched]="item().plex!.watched">
              {{ plexLabel() }}
            </span>
          }
        </div>

        <div class="cell-plays">
          <span class="plays-tautulli">T: {{ item().play_count || 0 }}</span>
          @if (item().plex) {
            <span class="plays-plex">P: {{ item().plex!.viewCount || 0 }}</span>
          }
        </div>

        <div class="cell-date">{{ fmt.bestDate(item().last_played, item().plex) }}</div>
        <div class="cell-size">{{ item().file_size | fileSize }}</div>

        <div class="cell-activity">
          @if (hasDiscrepancy()) {
            <span class="discrepancy-icon" [title]="item().discrepancy!.detail">⚠</span>
          } @else if (item().users_watching) {
            <span class="live-indicator">● LIVE</span>
          } @else if (item().progress_pct > 0 && item().progress_pct < 100) {
            <app-progress-bar [pct]="item().progress_pct" />
          }
        </div>

        <div class="cell-actions" (click)="$event.stopPropagation()">
          @if (canSelect()) {
            <button
              class="btn-row-delete"
              type="button"
              title="Delete via {{ item().arr!.instanceName }}"
              (click)="deleteRequested.emit(item())"
            >
              🗑
            </button>
          } @else if (arrConfigured()) {
            <button
              type="button"
              class="row-blocked"
              title="Click for why this item is blocked"
              (click)="showBlockReason()"
            >—</button>
          }
        </div>
      </div>

      @if (hasDiscrepancy()) {
        <div class="discrepancy-bar">
          <span class="discrepancy-type">{{ discrepancyLabel() }}</span>
          <span class="discrepancy-detail">{{ item().discrepancy!.detail }}</span>
        </div>
      }

      @if (item().plex?.watchedBy?.length) {
        <div class="watched-by-bar">
          <span class="watched-by-label">Watched by:</span>
          @for (user of item().plex!.watchedBy; track user.userId) {
            <span class="watched-by-user">{{ user.username }}</span>
          }
        </div>
      }

      @if (expanded() && item().seasons) {
        <app-season-detail [seasons]="item().seasons!" />
      }
    </div>
  `,
  styleUrl: './media-row.component.scss',
})
export class MediaRowComponent {
  readonly item = input.required<MediaItem>();
  readonly expanded = input<boolean>(false);
  readonly rowClicked = output<string>();
  readonly deleteRequested = output<MediaItem>();

  protected readonly fmt = inject(FormatService);
  protected readonly selection = inject(SelectionService);
  private readonly configSvc = inject(ConfigService);
  private readonly toast = inject(ToastService);

  readonly isShow = computed(() => this.item().media_type === 'show');

  readonly isSelected = computed(() =>
    this.selection.isSelected(this.item().rating_key)
  );

  /** True iff at least one *arr instance is configured. */
  readonly arrConfigured = computed(() => {
    const c = this.configSvc.config();
    return c.sonarr.length > 0 || c.radarr.length > 0;
  });

  readonly canSelect = computed(() => !!this.item().arr?.matched);

  readonly staleness = computed(() =>
    this.fmt.combinedStaleness(
      this.item().last_played,
      this.item().play_count,
      this.item().plex
    )
  );

  readonly hasDiscrepancy = computed(() => {
    const d = this.item().discrepancy;
    return d != null && d.type !== 'none';
  });

  readonly discrepancyLabel = computed(() => {
    const d = this.item().discrepancy;
    if (!d) return '';
    switch (d.type) {
      case 'plex_only': return 'PLEX ONLY';
      case 'tautulli_only': return 'TAUTULLI ONLY';
      case 'count_mismatch': return 'COUNT MISMATCH';
      default: return '';
    }
  });

  readonly plexLabel = computed(() => {
    const p = this.item().plex;
    if (!p) return '';
    if (this.isShow() && p.totalEpisodes) {
      return `${p.watchedEpisodes}/${p.totalEpisodes} eps`;
    }
    return p.watched ? 'Watched' : 'Unwatched';
  });

  onTitleClick(): void {
    if (this.isShow()) this.rowClicked.emit(this.item().rating_key);
  }

  onToggleSelect(): void {
    this.selection.toggle(this.item().rating_key);
  }

  onSelectCellClick(event: MouseEvent): void {
    event.stopPropagation();
    if (!this.canSelect()) this.showBlockReason();
  }

  showBlockReason(): void {
    this.toast.info(this.item().arr?.reason || 'No *arr instance for this item');
  }
}
