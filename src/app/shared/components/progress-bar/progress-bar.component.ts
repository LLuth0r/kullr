import { Component, input } from '@angular/core';

@Component({
  selector: 'app-progress-bar',
  standalone: true,
  template: `
    <div class="track">
      <div class="fill" [style.width.%]="pct()"></div>
    </div>
  `,
  styles: [`
    .track {
      width: 64px;
      height: 3px;
      background: var(--surface-6);
      border-radius: 2px;
      overflow: hidden;
    }
    .fill {
      height: 100%;
      background: var(--accent);
      border-radius: 2px;
      transition: width 0.3s ease;
    }
  `],
})
export class ProgressBarComponent {
  readonly pct = input<number>(0);
}
