import { Component, computed, inject, output } from '@angular/core';
import {
  MediaStateService,
  SelectionService,
} from '../../../../core/services';
import { MediaItem } from '../../../../core/models';
import { MediaRowComponent } from '../media-row/media-row.component';

@Component({
  selector: 'app-media-table',
  standalone: true,
  imports: [MediaRowComponent],
  template: `
    <div class="col-header">
      <span class="select-all-cell">
        <input
          type="checkbox"
          [checked]="allSelectableSelected()"
          [indeterminate]="someSelected() && !allSelectableSelected()"
          [disabled]="selectableCount() === 0"
          (change)="onToggleAll()"
          title="Select all visible (with *arr match)"
        />
      </span>
      <span>Title</span>
      <span>Status</span>
      <span>Plays (T/P)</span>
      <span>Last Watched</span>
      <span>Size</span>
      <span></span>
      <span></span>
    </div>

    <div class="media-list">
      @if (state.filteredItems().length === 0) {
        <div class="empty-msg">No media matches your filters.</div>
      }

      @for (item of state.filteredItems(); track item.rating_key) {
        <app-media-row
          [item]="item"
          [expanded]="state.expandedShows().has(item.rating_key)"
          (rowClicked)="state.toggleShowExpansion($event)"
          (deleteRequested)="deleteRequested.emit($event)"
        />
      }
    </div>

    <div class="footer">
      Showing {{ state.filteredItems().length }} of {{ state.mediaItems().length }} items
    </div>
  `,
  styleUrl: './media-table.component.scss',
})
export class MediaTableComponent {
  protected readonly state = inject(MediaStateService);
  protected readonly selection = inject(SelectionService);

  readonly deleteRequested = output<MediaItem>();

  readonly selectableCount = computed(
    () => this.state.filteredItems().filter((i) => i.arr?.matched).length
  );

  readonly someSelected = computed(() => this.selection.count() > 0);

  readonly allSelectableSelected = computed(() => {
    const selectable = this.state.filteredItems().filter((i) => i.arr?.matched);
    if (selectable.length === 0) return false;
    return selectable.every((i) => this.selection.isSelected(i.rating_key));
  });

  onToggleAll(): void {
    if (this.allSelectableSelected()) {
      this.selection.clear();
    } else {
      this.selection.selectAllVisible(this.state.filteredItems());
    }
  }
}
