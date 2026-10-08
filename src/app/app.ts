import { ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, OnInit, OnDestroy, signal } from '@angular/core';
import { RouterOutlet, Router, NavigationEnd, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { getTrainerToken } from './auth-utils';
import { SupabaseService } from './supabase.service';
import { ToastComponent } from './toast.component';
import { DialogComponent } from './dialog.component';
import { DialogService } from './dialog.service';
import { ThemeService } from './theme.service';
import { ThemeMode, THEME_MODES } from './theme-utils';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastComponent, DialogComponent],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements OnInit, OnDestroy {
  private router = inject(Router);
  private supa = inject(SupabaseService);
  private dialog = inject(DialogService);
  private host = inject(ElementRef<HTMLElement>);
  readonly theme = inject(ThemeService);

  readonly themeModes = THEME_MODES;

  isLoginPage = signal(true);
  currentPath = signal('');
  trainerName = signal('Personal Trainer');
  menuOpen = signal(false);

  private authSub?: { data: { subscription: { unsubscribe: () => void } } };

  ngOnInit() {
    this.checkAuthentication(this.router.url);

    // Redireciona para o login assim que a sessão Supabase cair (logout,
    // expiração ou falha no refresh do token) — sem depender de navegação.
    // Sem isso, o token expirado deixava a tela "vazia" em vez de pedir login.
    this.authSub = this.supa.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (!session && event !== 'INITIAL_SESSION')) {
        if (!this.router.url.includes('/login')) {
          this.router.navigate(['/login']);
        }
      }
    });

    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe((event) => {
      const url = (event as NavigationEnd).urlAfterRedirects || (event as NavigationEnd).url;
      this.currentPath.set(url);
      this.menuOpen.set(false);
      this.checkAuthentication(url);
    });

    // Nome real do personal, da sessão Supabase
    this.supa.client.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (user) {
        this.trainerName.set(user.user_metadata?.['name'] ?? user.email?.split('@')[0] ?? 'Personal Trainer');
      }
    });
  }

  private checkAuthentication(url: string) {
    const isLogin = url.includes('/login');
    this.isLoginPage.set(isLogin);

    if (!isLogin && !getTrainerToken()) {
      this.router.navigate(['/login']);
    } else if (isLogin && getTrainerToken()) {
      this.router.navigate(['/']);
    }
  }

  ngOnDestroy() {
    this.authSub?.data.subscription.unsubscribe();
  }

  toggleMenu() {
    this.menuOpen.update(v => !v);
  }

  themeLabel(mode: ThemeMode): string {
    return mode === 'claro' ? 'Claro' : mode === 'escuro' ? 'Escuro' : 'Auto';
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(ev: MouseEvent) {
    if (!this.menuOpen()) return;
    const menu = this.host.nativeElement.querySelector('.navMenu');
    if (menu && !menu.contains(ev.target as Node)) this.menuOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    this.menuOpen.set(false);
  }

  async handleLogout() {
    this.menuOpen.set(false);
    const ok = await this.dialog.confirm({
      title: 'Sair do sistema',
      message: 'Deseja realmente sair do sistema de Personal Trainer?',
      confirmText: 'Sair',
      cancelText: 'Ficar',
    });
    if (ok) {
      await this.supa.signOut();
      this.router.navigate(['/login']);
    }
  }
}
