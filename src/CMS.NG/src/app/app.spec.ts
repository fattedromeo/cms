import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App (shell)', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the UWA brand', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.sidebar__brand-text')?.textContent).toContain('UWA');
  });

  it('should render the 系統管理 Admin group with a 角色 AppRole link', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const links = Array.from(compiled.querySelectorAll('a.nav-item')).map((a) => a.textContent);
    expect(links.some((t) => t?.includes('角色 AppRole'))).toBeTrue();
  });

  it('toggleCollapsed flips the collapsed state', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance as unknown as {
      collapsed: () => boolean;
      toggleCollapsed: () => void;
    };
    expect(app.collapsed()).toBeFalse();
    app.toggleCollapsed();
    expect(app.collapsed()).toBeTrue();
  });
});
