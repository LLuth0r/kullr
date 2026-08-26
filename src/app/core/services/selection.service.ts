import { Injectable, signal, computed, inject } from '@angular/core';
import { MediaItem } from '../models';
import { MediaStateService } from './media-state.service';

/**
 * Tracks which media items the user has selected for bulk action.
 * Selection survives filter changes (a filtered-out item stays selected),
 * but is reset on a full library reload.
 */
@Injectable({ providedIn: 'root' })
export class SelectionService {
  private state = inject(MediaStateService);

  private selected = signal<Set<string>>(new Set());

  readonly count = computed(() => this.selected().size);

  readonly selectedItems = computed<MediaItem[]>(() => {
    const ids = this.selected();
    return this.state.mediaItems().filter((i) => ids.has(i.rating_key));
  });

  readonly totalSize = computed(() =>
    this.selectedItems().reduce((s, i) => s + i.file_size, 0)
  );

  isSelected(ratingKey: string): boolean {
    return this.selected().has(ratingKey);
  }

  toggle(ratingKey: string): void {
    this.selected.update((set) => {
      const next = new Set(set);
      if (next.has(ratingKey)) next.delete(ratingKey);
      else next.add(ratingKey);
      return next;
    });
  }

  /** Select every item currently visible (post-filter). */
  selectAllVisible(visible: MediaItem[]): void {
    this.selected.update((set) => {
      const next = new Set(set);
      for (const item of visible) {
        // Only allow selecting items that have a known *arr match — otherwise
        // bulk delete would silently drop them.
        if (item.arr?.matched) next.add(item.rating_key);
      }
      return next;
    });
  }

  clear(): void {
    this.selected.set(new Set());
  }
}
