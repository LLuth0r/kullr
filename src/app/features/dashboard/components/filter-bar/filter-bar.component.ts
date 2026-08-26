import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MediaStateService } from '../../../../core/services';
import { MediaFilters } from '../../../../core/models';

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="filter-bar">
      <input
        type="text"
        placeholder="Search titles…"
        [ngModel]="state.filters().search"
        (ngModelChange)="onFilter('search', $event)"
      />

      <select
        [ngModel]="state.filters().library"
        (ngModelChange)="onFilter('library', $event)"
      >
        <option value="all">All Libraries</option>
        @for (lib of state.libraries(); track lib.section_id) {
          <option [value]="lib.section_id">{{ lib.section_name }}</option>
        }
      </select>

      <select
        [ngModel]="state.filters().watchStatus"
        (ngModelChange)="onFilter('watchStatus', $event)"
      >
        <option value="all">All Status</option>
        <option value="never">Never Watched</option>
        <option value="stale180">Not Watched 6mo+</option>
        <option value="stale365">Not Watched 1yr+</option>
        <option value="in_progress">In Progress</option>
        <option value="completed">Completed</option>
        <option value="discrepancy">⚠ Discrepancies</option>
      </select>

      <select
        [ngModel]="state.filters().sort"
        (ngModelChange)="onFilter('sort', $event)"
      >
        <option value="staleness">Sort: Stalest First</option>
        <option value="size_desc">Sort: Largest First</option>
        <option value="title">Sort: A → Z</option>
        <option value="last_played">Sort: Recently Watched</option>
      </select>
    </div>
  `,
  styleUrl: './filter-bar.component.scss',
})
export class FilterBarComponent {
  protected readonly state = inject(MediaStateService);

  onFilter(key: string, value: string): void {
    this.state.updateFilters({ [key]: value } as Partial<MediaFilters>);
  }
}
