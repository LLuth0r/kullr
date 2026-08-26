import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  kind: 'info' | 'success' | 'error';
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  readonly toasts = signal<Toast[]>([]);

  show(kind: Toast['kind'], message: string, ttlMs = 5000): void {
    const t: Toast = { id: this.nextId++, kind, message };
    this.toasts.update((list) => [...list, t]);
    setTimeout(() => this.dismiss(t.id), ttlMs);
  }

  success(msg: string): void { this.show('success', msg); }
  error(msg: string): void { this.show('error', msg, 8000); }
  info(msg: string): void { this.show('info', msg); }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
