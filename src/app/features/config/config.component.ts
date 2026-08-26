import { Component, OnInit, inject, signal, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfigService } from '../../core/services';
import { AppConfig, ArrInstance } from '../../core/models';

interface InstanceFormState {
  id: string;
  name: string;
  url: string;
  apiKey: string;
  rootFolders: string[];
  enabled: boolean;
  testStatus: 'idle' | 'testing' | 'ok' | 'error';
  testMessage: string;
}

const newInstance = (
  defaults: Partial<InstanceFormState> = {}
): InstanceFormState => ({
  id: cryptoRandomId(),
  name: '',
  url: '',
  apiKey: '',
  rootFolders: [],
  enabled: true,
  testStatus: 'idle',
  testMessage: '',
  ...defaults,
});

function cryptoRandomId(): string {
  // Browser cryptographically-strong UUID. Fallback for old browsers.
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

@Component({
  selector: 'app-config',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './config.component.html',
  styleUrl: './config.component.scss',
})
export class ConfigComponent implements OnInit {
  private configSvc = inject(ConfigService);

  /** Emitted when the user has successfully saved a working config. */
  readonly connected = output<AppConfig>();

  // Plex
  plexUrl = '';
  plexToken = '';
  plexHasStored = signal(false);
  plexTestStatus = signal<'idle' | 'testing' | 'ok' | 'error'>('idle');
  plexServerName = signal('');

  // Tautulli
  tautulliUrl = '';
  tautulliKey = '';
  tautulliHasStored = signal(false);
  tautulliTestStatus = signal<'idle' | 'testing' | 'ok' | 'error'>('idle');
  tautulliTestMessage = signal('');

  // *arr
  sonarrInstances = signal<InstanceFormState[]>([]);
  radarrInstances = signal<InstanceFormState[]>([]);

  saving = signal(false);
  error = signal('');

  async ngOnInit(): Promise<void> {
    try {
      const cfg = await this.configSvc.load();
      this.hydrate(cfg);
    } catch (e: any) {
      this.error.set(`Failed to load config: ${e.message}`);
    }
  }

  private hydrate(cfg: AppConfig): void {
    if (cfg.plex) {
      this.plexUrl = cfg.plex.url;
      this.plexToken = cfg.plex.token; // masked from server
      this.plexHasStored.set(!!cfg.plex.token);
    }
    if (cfg.tautulli) {
      this.tautulliUrl = cfg.tautulli.url;
      this.tautulliKey = cfg.tautulli.apiKey;
      this.tautulliHasStored.set(!!cfg.tautulli.apiKey);
    }
    this.sonarrInstances.set(
      cfg.sonarr.map((s) =>
        newInstance({
          id: s.id,
          name: s.name,
          url: s.url,
          apiKey: s.apiKey,
          rootFolders: s.rootFolders ?? [],
          enabled: s.enabled,
        })
      )
    );
    this.radarrInstances.set(
      cfg.radarr.map((r) =>
        newInstance({
          id: r.id,
          name: r.name,
          url: r.url,
          apiKey: r.apiKey,
          rootFolders: r.rootFolders ?? [],
          enabled: r.enabled,
        })
      )
    );
  }

  // ── *arr instance management ──

  addSonarr(): void {
    this.sonarrInstances.update((list) => [
      ...list,
      newInstance({ name: list.length === 0 ? 'Sonarr' : `Sonarr ${list.length + 1}` }),
    ]);
  }

  addRadarr(): void {
    this.radarrInstances.update((list) => [
      ...list,
      newInstance({ name: list.length === 0 ? 'Radarr' : `Radarr ${list.length + 1}` }),
    ]);
  }

  removeSonarr(id: string): void {
    this.sonarrInstances.update((list) => list.filter((i) => i.id !== id));
  }

  removeRadarr(id: string): void {
    this.radarrInstances.update((list) => list.filter((i) => i.id !== id));
  }

  trackById(_: number, item: InstanceFormState): string {
    return item.id;
  }

  async testPlex(): Promise<void> {
    this.plexTestStatus.set('testing');
    try {
      const res = await this.configSvc.testPlex({
        url: this.plexUrl,
        token: this.plexToken,
      });
      this.plexServerName.set(res.serverName);
      this.plexTestStatus.set('ok');
    } catch (e: any) {
      this.plexTestStatus.set('error');
      this.plexServerName.set(e.message);
    }
  }

  async testTautulli(): Promise<void> {
    this.tautulliTestStatus.set('testing');
    this.tautulliTestMessage.set('');
    try {
      await this.configSvc.testTautulli({
        url: this.tautulliUrl,
        apiKey: this.tautulliKey,
      });
      this.tautulliTestStatus.set('ok');
    } catch (e: any) {
      this.tautulliTestStatus.set('error');
      this.tautulliTestMessage.set(e.message);
    }
  }

  async testInstance(
    type: 'sonarr' | 'radarr',
    id: string
  ): Promise<void> {
    const list =
      type === 'sonarr' ? this.sonarrInstances : this.radarrInstances;
    const instance = list().find((i) => i.id === id);
    if (!instance) return;

    this.updateInstance(type, id, { testStatus: 'testing', testMessage: '' });
    try {
      const res = await this.configSvc.testArr(type, this.toArr(instance));
      this.updateInstance(type, id, {
        testStatus: 'ok',
        testMessage:
          res.rootFolders.length > 0
            ? `OK · ${res.rootFolders.join(', ')}`
            : 'Connected · no root folders defined',
        rootFolders: res.rootFolders,
      });
    } catch (e: any) {
      this.updateInstance(type, id, {
        testStatus: 'error',
        testMessage: e.message,
      });
    }
  }

  private updateInstance(
    type: 'sonarr' | 'radarr',
    id: string,
    patch: Partial<InstanceFormState>
  ): void {
    const sig = type === 'sonarr' ? this.sonarrInstances : this.radarrInstances;
    sig.update((list) =>
      list.map((i) => (i.id === id ? { ...i, ...patch } : i))
    );
  }

  private toArr(i: InstanceFormState): ArrInstance {
    return {
      id: i.id,
      name: i.name.trim(),
      url: i.url.trim(),
      apiKey: i.apiKey.trim(),
      rootFolders: i.rootFolders,
      enabled: i.enabled,
    };
  }

  async onSave(): Promise<void> {
    if (
      !this.plexUrl ||
      !this.plexToken ||
      !this.tautulliUrl ||
      !this.tautulliKey
    ) {
      this.error.set('Plex and Tautulli are required.');
      return;
    }
    this.saving.set(true);
    this.error.set('');

    try {
      const payload: AppConfig = {
        plex: { url: this.plexUrl, token: this.plexToken },
        tautulli: { url: this.tautulliUrl, apiKey: this.tautulliKey },
        sonarr: this.sonarrInstances().map((i) => this.toArr(i)),
        radarr: this.radarrInstances().map((i) => this.toArr(i)),
      };
      const saved = await this.configSvc.save(payload);
      this.hydrate(saved);
      this.connected.emit(saved);
    } catch (e: any) {
      this.error.set(`Save failed: ${e.message}`);
    } finally {
      this.saving.set(false);
    }
  }
}
