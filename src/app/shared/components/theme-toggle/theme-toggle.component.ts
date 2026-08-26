import { Component, inject } from '@angular/core';
import { ThemeService } from '../../../core/services';

@Component({
  selector: 'app-theme-toggle',
  standalone: true,
  template: `
    <button
      type="button"
      class="theme-toggle"
      (click)="theme.toggle()"
      [attr.aria-label]="theme.theme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'"
      title="Toggle light / dark mode"
    >
      @if (theme.theme() === 'dark') {
        <!-- sun -->
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="12" cy="12" r="4.5" />
          <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
        </svg>
      } @else {
        <!-- moon -->
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
        </svg>
      }
    </button>
  `,
  styles: [`
    .theme-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      padding: 0;
      border-radius: 7px;
      border: 1px solid var(--border);
      background: var(--bg-panel);
      color: var(--text-secondary);
      cursor: pointer;
      transition: background 0.15s, color 0.15s;

      &:hover {
        background: var(--bg-hover);
        color: var(--accent);
      }
    }
  `],
})
export class ThemeToggleComponent {
  readonly theme = inject(ThemeService);
}
