import { Component, inject, output } from '@angular/core';
import { SelectionService } from '../../../../core/services';
import { FileSizePipe } from '../../../../shared/pipes/file-size.pipe';

@Component({
  selector: 'app-bulk-action-bar',
  standalone: true,
  imports: [FileSizePipe],
  template: `
    @if (selection.count() > 0) {
      <div class="bulk-bar">
        <div class="bulk-info">
          <span class="bulk-count">{{ selection.count() }}</span>
          <span class="bulk-label">selected</span>
          <span class="bulk-size">· {{ selection.totalSize() | fileSize }}</span>
        </div>
        <div class="bulk-actions">
          <button class="btn-clear" (click)="selection.clear()">Clear</button>
          <button class="btn-delete" (click)="deleteRequested.emit()">
            Delete selected
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    .bulk-bar {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-panel);
      border: 1px solid var(--border);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
      border-radius: 12px;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 16px;
      z-index: 50;
      animation: slideUp 0.2s ease-out;
    }

    @keyframes slideUp {
      from { opacity: 0; transform: translate(-50%, 12px); }
      to { opacity: 1; transform: translate(-50%, 0); }
    }

    .bulk-info {
      display: flex;
      align-items: baseline;
      gap: 6px;
      font-size: 12px;
      color: var(--text-secondary);

      .bulk-count {
        font-size: 16px;
        font-weight: 700;
        color: var(--text-primary);
      }

      .bulk-size { color: var(--text-dim); }
    }

    .bulk-actions {
      display: flex;
      gap: 8px;
    }

    button {
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
    }

    .btn-clear {
      background: transparent;
      border-color: var(--border);
      color: var(--text-secondary);
    }

    .btn-clear:hover { background: rgba(255, 255, 255, 0.05); }

    .btn-delete {
      background: linear-gradient(135deg, #e54545, #b53535);
      color: #fff;
    }

    .btn-delete:hover { opacity: 0.92; }
  `],
})
export class BulkActionBarComponent {
  protected selection = inject(SelectionService);
  readonly deleteRequested = output<void>();
}
