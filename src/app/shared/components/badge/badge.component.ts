import { Component, input } from '@angular/core';
import { StalenessInfo } from '../../../core/models';

@Component({
  selector: 'app-badge',
  standalone: true,
  template: `
    <span
      class="badge"
      [style.color]="info().color"
      [style.background]="info().bg"
      [style.border-color]="info().color + '22'"
    >
      {{ info().label }}
    </span>
  `,
  styles: [`
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.6px;
      font-family: var(--mono);
      white-space: nowrap;
      border-width: 1px;
      border-style: solid;
    }
  `],
})
export class BadgeComponent {
  readonly info = input.required<StalenessInfo>();
}
