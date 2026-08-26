import { Component, input, output, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MediaItem } from '../../../../core/models';
import { ConfigService, ToastService } from '../../../../core/services';
import { FileSizePipe } from '../../../../shared/pipes/file-size.pipe';

@Component({
  selector: 'app-delete-modal',
  standalone: true,
  imports: [FormsModule, FileSizePipe],
  template: `
    <div class="modal-backdrop" (click)="onBackdrop($event)">
      <div class="modal" role="dialog" aria-modal="true">
        <header>
          <h2>Delete {{ items().length }} item{{ items().length === 1 ? '' : 's' }}</h2>
          <button class="close" type="button" (click)="cancel()">×</button>
        </header>

        <div class="summary">
          <div class="summary-line">
            <span class="label">Reclaimable space</span>
            <span class="value">{{ totalSize() | fileSize }}</span>
          </div>
          <div class="summary-line">
            <span class="label">Routed via</span>
            <span class="value">{{ instancesSummary() }}</span>
          </div>
          @if (unmatchedCount() > 0) {
            <div class="warn">
              {{ unmatchedCount() }} item{{ unmatchedCount() === 1 ? '' : 's' }}
              cannot be deleted (no matching *arr instance) — they'll be skipped.
            </div>
          }
        </div>

        <ul class="targets">
          @for (item of items(); track item.rating_key) {
            <li [class.skipped]="!item.arr?.matched">
              <span class="t-title">{{ item.title }}</span>
              <span class="t-meta">
                {{ item.file_size | fileSize }}
                @if (item.arr?.matched) {
                  · {{ item.arr!.instanceName }}
                } @else {
                  · <span class="t-skip">{{ item.arr?.reason || 'no instance' }}</span>
                }
              </span>
            </li>
          }
        </ul>

        <fieldset class="opts">
          <label class="cb">
            <input type="checkbox" [(ngModel)]="deleteFiles" />
            <span>Delete files from disk</span>
            <span class="hint">Removes the media files via *arr</span>
          </label>
          <label class="cb">
            <input type="checkbox" [(ngModel)]="unmonitor" />
            <span>Unmonitor</span>
            <span class="hint">Stop *arr from re-grabbing this. Ignored if "Delete files" is checked.</span>
          </label>
          <label class="cb">
            <input type="checkbox" [(ngModel)]="addExclusion" />
            <span>Add to import-list exclusion</span>
            <span class="hint">Prevents auto re-add from import lists</span>
          </label>
        </fieldset>

        @if (error()) {
          <div class="error-box">{{ error() }}</div>
        }

        <div class="actions">
          <button type="button" class="btn-secondary" (click)="cancel()" [disabled]="busy()">
            Cancel
          </button>
          <button
            type="button"
            class="btn-danger"
            [disabled]="busy() || actionableCount() === 0 || (!deleteFiles && !unmonitor)"
            (click)="confirm()"
          >
            {{
              busy()
                ? 'Working…'
                : (deleteFiles
                    ? 'Delete ' + actionableCount() + ' item' + (actionableCount() === 1 ? '' : 's')
                    : 'Unmonitor ' + actionableCount() + ' item' + (actionableCount() === 1 ? '' : 's'))
            }}
          </button>
        </div>
      </div>
    </div>
  `,
  styleUrl: './delete-modal.component.scss',
})
export class DeleteModalComponent {
  readonly items = input.required<MediaItem[]>();
  readonly closed = output<{ refresh: boolean }>();

  private configSvc = inject(ConfigService);
  private toast = inject(ToastService);

  deleteFiles = true;
  unmonitor = true;
  addExclusion = false;

  busy = signal(false);
  error = signal('');

  totalSize = computed(() =>
    this.items().reduce((s, i) => s + i.file_size, 0)
  );

  actionableCount = computed(
    () => this.items().filter((i) => i.arr?.matched).length
  );

  unmatchedCount = computed(
    () => this.items().filter((i) => !i.arr?.matched).length
  );

  instancesSummary = computed(() => {
    const set = new Set<string>();
    for (const item of this.items()) {
      if (item.arr?.instanceName) set.add(item.arr.instanceName);
    }
    return set.size ? Array.from(set).join(', ') : '—';
  });

  cancel(): void {
    if (!this.busy()) this.closed.emit({ refresh: false });
  }

  onBackdrop(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.cancel();
    }
  }

  async confirm(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const payload = this.items()
        .filter((i) => i.arr?.matched)
        .map((i) => ({
          ratingKey: i.rating_key,
          filePath: i.plex?.filePath ?? '',
          mediaType: i.media_type,
          title: i.title,
        }));
      const results = await this.configSvc.deleteItems(payload, {
        deleteFiles: this.deleteFiles,
        unmonitor: this.unmonitor,
        addImportListExclusion: this.addExclusion,
      });
      const successes = results.filter((r) => r.ok).length;
      const failures = results.filter((r) => !r.ok);
      if (successes > 0) {
        this.toast.success(
          `${successes} item${successes === 1 ? '' : 's'} ${this.deleteFiles ? 'deleted' : 'unmonitored'}`
        );
      }
      for (const f of failures) {
        this.toast.error(`${f.title ?? f.ratingKey}: ${f.error}`);
      }
      this.closed.emit({ refresh: successes > 0 });
    } catch (e: any) {
      this.error.set(e.message);
    } finally {
      this.busy.set(false);
    }
  }
}
