import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { environment } from '@env/environment';
import { Profile } from './profile';
import { AUTH_STORAGE_KEY, AuthService } from '@core/services/auth.service';
import { signInAs } from '@core/testing/auth-test-utils';

describe('Profile (個人資料)', () => {
  let httpMock: HttpTestingController;
  const profileUrl = `${environment.apiUrl}/auth/profile`;

  /** Seeds the session BEFORE the TestBed: AuthService reads storage once, at construction. */
  function setup(roles: string[] = ['Admin', 'developer', 'User']) {
    sessionStorage.clear();
    signInAs(roles);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Profile],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);

    const fixture = TestBed.createComponent(Profile);
    fixture.detectChanges();
    return fixture;
  }

  const el = (fixture: ReturnType<typeof setup>) => fixture.nativeElement as HTMLElement;

  function setUserName(fixture: ReturnType<typeof setup>, value: string) {
    (fixture.componentInstance as unknown as {
      form: { controls: { userName: { setValue: (v: string) => void } } };
    }).form.controls.userName.setValue(value);
  }

  function save(fixture: ReturnType<typeof setup>) {
    (fixture.componentInstance as unknown as { save: () => void }).save();
  }

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
  });

  it('creates', () => {
    expect(setup().componentInstance).toBeTruthy();
  });

  // --- UserId is shown read-only -----------------------------------------
  it('shows the UserId and makes it read-only', () => {
    const fixture = setup();
    const userId = el(fixture).querySelector<HTMLInputElement>('#userId')!;

    expect(userId.value).toBe('miles@uuu.com.tw');
    // Read-only in the UI mirrors the API, where the account comes from the JWT and the request DTO
    // has no userId property at all.
    expect(userId.readOnly).toBeTrue();
    expect(userId.disabled).toBeTrue();
  });

  it('shows the UserName in an editable field', () => {
    const fixture = setup();
    const userName = el(fixture).querySelector<HTMLInputElement>('#userName')!;

    expect(userName.value).toBe('Miles Sun');
    expect(userName.readOnly).toBeFalse();
    expect(userName.disabled).toBeFalse();
  });

  // --- Roles are display-only, from the token -----------------------------
  it('shows every role from the token, display-only', () => {
    const fixture = setup(['Admin', 'developer', 'User']);
    const roles = el(fixture).querySelector('[data-testid="roles"]')!;

    expect(roles.textContent).toContain('Admin');
    expect(roles.textContent).toContain('developer');
    expect(roles.textContent).toContain('User');
    // No input/select anywhere in the roles block — nothing to edit.
    expect(roles.querySelector('input')).toBeNull();
    expect(roles.querySelector('select')).toBeNull();
  });

  it('reads roles from the token with no extra API call', () => {
    // httpMock.verify() in afterEach is the assertion: a roles request would fail it.
    const fixture = setup(['User']);

    expect(el(fixture).querySelector('[data-testid="roles"]')!.textContent).toContain('User');
  });

  it('handles a user with no roles', () => {
    const fixture = setup([]);

    expect(el(fixture).querySelector('[data-testid="roles"]')!.textContent).toContain('未指派任何角色');
  });

  // --- Saving -------------------------------------------------------------
  it('PUTs only the userName', () => {
    const fixture = setup();
    setUserName(fixture, 'Miles S.');

    save(fixture);

    const req = httpMock.expectOne(profileUrl);
    expect(req.request.method).toBe('PUT');
    // No userId in the body: the API takes it from the token, and sending one would imply otherwise.
    expect(req.request.body).toEqual({ userName: 'Miles S.' });
    req.flush({ userId: 'miles@uuu.com.tw', userName: 'Miles S.' });
  });

  it('updates the shell and session storage on success', () => {
    const fixture = setup();
    const auth = TestBed.inject(AuthService);
    setUserName(fixture, 'Miles S.');

    save(fixture);
    httpMock.expectOne(profileUrl).flush({ userId: 'miles@uuu.com.tw', userName: 'Miles S.' });

    // The shell renders auth.userName(), so this is what makes the header update.
    expect(auth.userName()).toBe('Miles S.');
    expect(JSON.parse(sessionStorage.getItem(AUTH_STORAGE_KEY)!).userName).toBe('Miles S.');
  });

  it('adopts the SERVER trimmed name, not the typed one', () => {
    const fixture = setup();
    const auth = TestBed.inject(AuthService);
    setUserName(fixture, '  Miles S.  ');

    save(fixture);
    const req = httpMock.expectOne(profileUrl);
    expect(req.request.body).toEqual({ userName: 'Miles S.' }); // trimmed before sending
    // The API is the authority on what was stored; echoing our own input could drift from it.
    req.flush({ userId: 'miles@uuu.com.tw', userName: 'Server Trimmed' });

    expect(auth.userName()).toBe('Server Trimmed');
  });

  it('keeps the stored userId untouched when the name changes', () => {
    const fixture = setup();
    setUserName(fixture, 'Renamed');

    save(fixture);
    httpMock.expectOne(profileUrl).flush({ userId: 'miles@uuu.com.tw', userName: 'Renamed' });

    const stored = JSON.parse(sessionStorage.getItem(AUTH_STORAGE_KEY)!);
    expect(stored.userId).toBe('miles@uuu.com.tw');
    expect(stored.accessToken).toBeTruthy(); // the token survives; only the name changed
  });

  it('does not call the API for a whitespace-only name', () => {
    const fixture = setup();
    setUserName(fixture, '   ');

    save(fixture);

    httpMock.expectNone(profileUrl);
  });

  it('leaves the shell name alone when the save fails', () => {
    const fixture = setup();
    const auth = TestBed.inject(AuthService);
    setUserName(fixture, 'Nope');

    save(fixture);
    httpMock.expectOne(profileUrl).flush('bad', { status: 400, statusText: 'Bad Request' });

    expect(auth.userName()).toBe('Miles Sun');
    expect(JSON.parse(sessionStorage.getItem(AUTH_STORAGE_KEY)!).userName).toBe('Miles Sun');
  });

  it('clears the saving flag after a failure so the user can retry', () => {
    const fixture = setup();
    setUserName(fixture, 'Nope');

    save(fixture);
    httpMock.expectOne(profileUrl).flush('bad', { status: 400, statusText: 'Bad Request' });

    expect((fixture.componentInstance as unknown as { saving: () => boolean }).saving()).toBeFalse();
  });

  // --- 變更密碼 Change password ------------------------------------------
  describe('change password', () => {
    const changeUrl = `${environment.apiUrl}/auth/change-password`;

    function passwordForm(fixture: ReturnType<typeof setup>) {
      return (fixture.componentInstance as unknown as {
        passwordForm: {
          setValue: (v: unknown) => void;
          invalid: boolean;
          hasError: (e: string) => boolean;
          controls: { newPassword: { hasError: (e: string) => boolean } };
        };
      }).passwordForm;
    }

    function fill(fixture: ReturnType<typeof setup>, current: string, next: string, confirm: string) {
      passwordForm(fixture).setValue({
        currentPassword: current,
        newPassword: next,
        confirmNewPassword: confirm,
      });
    }

    function submit(fixture: ReturnType<typeof setup>) {
      (fixture.componentInstance as unknown as { changePassword: () => void }).changePassword();
    }

    const errorOf = (fixture: ReturnType<typeof setup>) =>
      (fixture.componentInstance as unknown as { passwordError: () => string }).passwordError();

    it('renders the three fields', () => {
      const fixture = setup();

      expect(el(fixture).querySelector('#currentPassword')).not.toBeNull();
      expect(el(fixture).querySelector('#newPassword')).not.toBeNull();
      expect(el(fixture).querySelector('#confirmNewPassword')).not.toBeNull();
    });

    // --- Client-side validation blocks the call ---------------------------
    it('does not call the API when the form is empty', () => {
      const fixture = setup();

      submit(fixture);

      httpMock.expectNone(changeUrl);
    });

    it('does not call the API when the new password fails the policy', () => {
      const fixture = setup();
      fill(fixture, 'P@ssw0rd!', 'abcdefgh', 'abcdefgh'); // 1 class

      submit(fixture);

      expect(passwordForm(fixture).controls.newPassword.hasError('passwordPolicy')).toBeTrue();
      httpMock.expectNone(changeUrl);
    });

    it('does not call the API when the new password is too short', () => {
      const fixture = setup();
      fill(fixture, 'P@ssw0rd!', 'Ab1!xyz', 'Ab1!xyz'); // 7 chars

      submit(fixture);

      expect(passwordForm(fixture).controls.newPassword.hasError('passwordPolicy')).toBeTrue();
      httpMock.expectNone(changeUrl);
    });

    it('does not call the API when new and confirm differ', () => {
      const fixture = setup();
      fill(fixture, 'P@ssw0rd!', 'Str0ng!Pass', 'Str0ng!Pasz');

      submit(fixture);

      expect(passwordForm(fixture).hasError('passwordsMismatch')).toBeTrue();
      httpMock.expectNone(changeUrl);
    });

    it('shows the specified bilingual policy message', () => {
      const fixture = setup();
      fill(fixture, 'P@ssw0rd!', 'abcdefgh', 'abcdefgh');
      submit(fixture); // marks touched
      fixture.detectChanges();

      const text = el(fixture).querySelector('[data-testid="policy-error"]')?.textContent ?? '';
      expect(text).toContain('密碼長度至少需 8 碼');
      expect(text).toContain('大寫英文／小寫英文／數字／符號');
      expect(text).toContain('at least 3 of the 4 classes');
    });

    it('shows a mismatch message next to the confirm field', () => {
      const fixture = setup();
      fill(fixture, 'P@ssw0rd!', 'Str0ng!Pass', 'Str0ng!Pasz');
      submit(fixture);
      fixture.detectChanges();

      expect(el(fixture).querySelector('[data-testid="mismatch-error"]')).not.toBeNull();
    });

    // --- The request ------------------------------------------------------
    it('posts the three fields untrimmed', () => {
      const fixture = setup();
      fill(fixture, ' P@ssw0rd! ', 'Str0ng!Pass', 'Str0ng!Pass');

      submit(fixture);

      const req = httpMock.expectOne(changeUrl);
      expect(req.request.method).toBe('POST');
      // Whitespace is part of a password — trimming would send something the user did not type.
      expect(req.request.body).toEqual({
        currentPassword: ' P@ssw0rd! ',
        newPassword: 'Str0ng!Pass',
        confirmNewPassword: 'Str0ng!Pass',
      });
      req.flush(null);
    });

    it('sends no hash and no userId', () => {
      const fixture = setup();
      fill(fixture, 'P@ssw0rd!', 'Str0ng!Pass', 'Str0ng!Pass');

      submit(fixture);

      const req = httpMock.expectOne(changeUrl);
      const body = req.request.body as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual([
        'confirmNewPassword',
        'currentPassword',
        'newPassword',
      ]);
      req.flush(null);
    });

    // --- After a successful change ----------------------------------------
    it('signs the user out and redirects to /login', () => {
      const fixture = setup();
      const auth = TestBed.inject(AuthService);
      const router = TestBed.inject(Router);
      const navigate = spyOn(router, 'navigate');
      fill(fixture, 'P@ssw0rd!', 'Str0ng!Pass', 'Str0ng!Pass');

      submit(fixture);
      httpMock.expectOne(changeUrl).flush(null);

      expect(auth.isAuthenticated()).toBeFalse();
      expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/login'], jasmine.any(Object));
    });

    // --- Server rejections -------------------------------------------------
    it('shows the API message on a wrong current password, and stays signed in', () => {
      const fixture = setup();
      const auth = TestBed.inject(AuthService);
      fill(fixture, 'wrong-but-valid', 'Str0ng!Pass', 'Str0ng!Pass');

      submit(fixture);
      httpMock
        .expectOne(changeUrl)
        .flush({ message: '目前密碼不正確。' }, { status: 400, statusText: 'Bad Request' });

      expect(errorOf(fixture)).toBe('目前密碼不正確。');
      // A 400 (not 401) is what keeps the interceptor from throwing the user out over a typo.
      expect(auth.isAuthenticated()).toBeTrue();
    });

    it('falls back to a generic message when the server says nothing useful', () => {
      const fixture = setup();
      fill(fixture, 'P@ssw0rd!', 'Str0ng!Pass', 'Str0ng!Pass');

      submit(fixture);
      httpMock.expectOne(changeUrl).flush('boom', { status: 500, statusText: 'Server Error' });

      expect(errorOf(fixture)).toBe('無法變更密碼，請稍後再試。');
    });

    it('clears the loading flag after a failure so the user can retry', () => {
      const fixture = setup();
      fill(fixture, 'P@ssw0rd!', 'Str0ng!Pass', 'Str0ng!Pass');

      submit(fixture);
      httpMock.expectOne(changeUrl).flush({ message: 'x' }, { status: 400, statusText: 'Bad Request' });

      const changing = (fixture.componentInstance as unknown as {
        changingPassword: () => boolean;
      }).changingPassword();
      expect(changing).toBeFalse();
    });

    it('a failed password change does not disturb the name form', () => {
      const fixture = setup();
      setUserName(fixture, 'Edited but unsaved');
      fill(fixture, 'wrong', 'Str0ng!Pass', 'Str0ng!Pass');

      submit(fixture);
      httpMock.expectOne(changeUrl).flush({ message: 'x' }, { status: 400, statusText: 'Bad Request' });

      const userName = (fixture.componentInstance as unknown as {
        form: { controls: { userName: { value: string } } };
      }).form.controls.userName.value;
      expect(userName).toBe('Edited but unsaved');
    });
  });

  it('reset restores the stored name', () => {
    const fixture = setup();
    setUserName(fixture, 'Half-typed');

    (fixture.componentInstance as unknown as { reset: () => void }).reset();

    const userName = (fixture.componentInstance as unknown as {
      form: { controls: { userName: { value: string } } };
    }).form.controls.userName.value;
    expect(userName).toBe('Miles Sun');
  });
});
