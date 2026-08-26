import { Component, input, inject } from '@angular/core';
import { Season } from '../../../../core/models';
import { FormatService } from '../../../../core/services';
import { BadgeComponent } from '../../../../shared/components/badge/badge.component';
import { FileSizePipe } from '../../../../shared/pipes/file-size.pipe';

@Component({
  selector: 'app-season-detail',
  standalone: true,
  imports: [BadgeComponent, FileSizePipe],
  template: `
    <div class="season-block">
      @for (season of seasons(); track season.rating_key) {
        <div class="season-header">
          <span>{{ season.title }}</span>
          <span class="season-count">
            <span class="source-label">T:</span> {{ season.episodes_watched }}/{{ season.episodes_total }}
            @if (season.plexEpisodesWatched !== undefined) {
              <span class="sep">·</span>
              <span class="source-label">P:</span> {{ season.plexEpisodesWatched }}/{{ season.episodes_total }}
            }
            @if (season.plexEpisodesWatched !== undefined && season.plexEpisodesWatched !== season.episodes_watched) {
              <span class="season-discrepancy">⚠</span>
            }
          </span>
        </div>

        @for (ep of season.episodes; track ep.rating_key) {
          <div class="episode-row" [class.ep-discrepancy]="ep.discrepancy && ep.discrepancy.type !== 'none'">
            <div class="ep-title">
              <span class="ep-index">E{{ ep.media_index.toString().padStart(2, '0') }}</span>
              {{ ep.title }}
            </div>
            <div class="ep-status-dual">
              <app-badge [info]="fmt.combinedStaleness(ep.last_played, ep.play_count, ep.plex)" />
              @if (ep.plex) {
                <span class="ep-plex-state" [class.watched]="ep.plex.watched">
                  {{ ep.plex.watched ? '✓ Plex' : '✗ Plex' }}
                </span>
              }
            </div>
            <div class="ep-plays">
              <span>T: {{ ep.play_count || 0 }}</span>
              @if (ep.plex) {
                <span class="ep-plex-count">P: {{ ep.plex.viewCount || 0 }}</span>
              }
            </div>
            <div class="ep-date">{{ fmt.bestDate(ep.last_played, ep.plex) }}</div>
            <div class="ep-size">{{ ep.file_size | fileSize }}</div>
          </div>
          @if (ep.discrepancy && ep.discrepancy.type !== 'none') {
            <div class="ep-discrepancy-bar">
              ⚠ {{ ep.discrepancy.detail }}
            </div>
          }
        }
      }
    </div>
  `,
  styleUrl: './season-detail.component.scss',
})
export class SeasonDetailComponent {
  readonly seasons = input.required<Season[]>();
  protected readonly fmt = inject(FormatService);
}
