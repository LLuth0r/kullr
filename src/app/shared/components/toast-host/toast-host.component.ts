import { Component, inject } from '@angular/core';
import { ToastService } from '../../../core/services';

@Component({
  selector: 'app-toast-host',
  standalone: true,
  template: `
    <div class="toast-stack">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [class.error]="t.kind === 'error'" [class.success]="t.kind === 'success'">
          <span>{{ t.message }}</span>
          <button (click)="toast.dismiss(t.id)">×</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .toast-stack {
      position: fixed;
      top: 16px;
      right: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 200;
      max-width: 360px;
    }

    .toast {
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-left: 3px solid var(--accent);
      border-radius: 8px;
      padding: 10px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      color: var(--text-primary);
      font-size: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
      animation: slideIn 0.2s ease-out;

      button {
        background: transparent;
        border: none;
        color: var(--text-muted);
        font-size: 16px;
        cursor: pointer;
        padding: 0;

        &:hover { color: var(--text-primary); }
      }

      &.success { border-left-color: var(--green-bright); }
      &.error { border-left-color: var(--red); }
    }

    @keyframes slideIn {
      from { opacity: 0; transform: translateX(20px); }
      to { opacity: 1; transform: translateX(0); }
    }
  `],
})
export class ToastHostComponent {
  protected toast = inject(ToastService);
}
