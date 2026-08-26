import { Component, OnInit, signal, inject } from '@angular/core';
import { ConfigComponent } from './features/config/config.component';
import { DashboardComponent } from './features/dashboard/dashboard.component';
import { AppConfig } from './core/models';
import { ConfigService } from './core/services';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ConfigComponent, DashboardComponent],
  template: `
    @if (view() === 'config') {
      <app-config (connected)="onConnected($event)" />
    } @else if (view() === 'dashboard') {
      <app-dashboard (disconnected)="onDisconnected()" />
    } @else {
      <div class="boot">Loading…</div>
    }
  `,
  styles: [`
    .boot {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      color: var(--text-dim);
      font-size: 14px;
    }
  `],
})
export class App implements OnInit {
  private configSvc = inject(ConfigService);

  readonly view = signal<'boot' | 'config' | 'dashboard'>('boot');

  async ngOnInit(): Promise<void> {
    try {
      const cfg = await this.configSvc.load();
      this.view.set(cfg.configured ? 'dashboard' : 'config');
    } catch {
      // Backend unreachable / fresh install — fall back to config UI.
      this.view.set('config');
    }
  }

  onConnected(_config: AppConfig): void {
    this.view.set('dashboard');
  }

  onDisconnected(): void {
    this.view.set('config');
  }
}
