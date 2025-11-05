import { Component, OnInit, Inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { LadderService, LadderEntry } from '../services/ladder.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home-component.html',
  styleUrls: ['./home-component.css'],
})
export class HomeComponent implements OnInit {
  loading = signal(true);
  error = signal<string | null>(null);
  lastModified = signal<string | null>(null);
  entries = signal<LadderEntry[]>([]);

  constructor(
    @Inject(PLATFORM_ID) private platformId: Object,
    private ladder: LadderService
  ) {}

  ngOnInit() {
    console.log('HomeComponent init, calling API:', this.ladder['base']); // should be "/api"
    if (!isPlatformBrowser(this.platformId)) {
      this.loading.set(false);
      return;
    }

    this.ladder.getMop3v3Recent().subscribe({
      next: (res) => {
        this.entries.set(res.entries ?? []);
        this.lastModified.set(res.meta?.lastModified ?? null);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.error || 'Failed to load ladder');
        this.loading.set(false);
      },
    });
  }

  trackByEntry = (_: number, entry: LadderEntry) => {
    const realm = entry.realm?.slug ?? 'unknown'; // <- fixed typo
    const name = entry.name ?? 'noname';
    const cls = entry.class?.id ?? 'noclass';
    const faction = entry.faction?.type ?? 'nofaction';
    return `${realm}:${name}:${cls}:${faction}`;
  };
}
