import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { convertToParamMap } from '@angular/router';
import { environment } from '@env/environment';
import { Login } from './login';
import { AUTH_STORAGE_KEY } from '@core/services/auth.service';
import { makeToken } from '@core/testing/auth-test-utils';

describe('Login', () => {
  let httpMock: HttpTestingController;
  let router: Router;
  const loginUrl = `${environment.apiUrl}/auth/login`;

  function setup(queryParams: Record<string, string> = {}) {
    sessionStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    spyOn(router, 'navigateByUrl');

    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    return fixture;
  }

  function fill(fixture: ReturnType<typeof setup>, userId: string, password: string) {
    const form = (fixture.componentInstance as unknown as {
      form: { setValue: (v: unknown) => void };
    }).form;
    form.setValue({ userId, password });
  }

  function submit(fixture: ReturnType<typeof setup>) {
    (fixture.componentInstance as unknown as { submit: () => void }).submit();
  }

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
  });

  it('creates', () => {
    expect(setup().componentInstance).toBeTruthy();
  });

  it('does not call the API when the form is empty', () => {
    const fixture = setup();

    submit(fixture);

    httpMock.expectNone(loginUrl);
  });

  it('posts the credentials and navigates home on success', () => {
    const fixture = setup();
    fill(fixture, 'miles@uuu.com.tw', 'P@ssw0rd!');

    submit(fixture);

    const req = httpMock.expectOne(loginUrl);
    expect(req.request.body).toEqual({ userId: 'miles@uuu.com.tw', password: 'P@ssw0rd!' });
    req.flush({ userId: 'miles@uuu.com.tw', userName: 'Miles Sun', accessToken: makeToken(['User']) });

    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).not.toBeNull();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/courses');
  });

  it('returns the user to where the guard bounced them from', () => {
    const fixture = setup({ returnUrl: '/courses/42/edit' });
    fill(fixture, 'miles@uuu.com.tw', 'P@ssw0rd!');

    submit(fixture);
    httpMock
      .expectOne(loginUrl)
      .flush({ userId: 'u', userName: 'U', accessToken: makeToken(['User']) });

    expect(router.navigateByUrl).toHaveBeenCalledWith('/courses/42/edit');
  });

  it('shows a generic error on 401 and stays put', () => {
    const fixture = setup();
    fill(fixture, 'miles@uuu.com.tw', 'wrong');

    submit(fixture);
    httpMock.expectOne(loginUrl).flush(
      { message: 'invalid credentials' },
      { status: 401, statusText: 'Unauthorized' },
    );
    fixture.detectChanges();

    // The API refuses to say which check failed (see spec/auth/Login.md), so the UI must not
    // pretend to know either.
    const error = (fixture.componentInstance as unknown as { error: () => string }).error();
    expect(error).toBe('使用者代碼或密碼錯誤。');
    expect(router.navigateByUrl).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(AUTH_STORAGE_KEY)).toBeNull();
  });

  it('distinguishes a server error from bad credentials', () => {
    const fixture = setup();
    fill(fixture, 'miles@uuu.com.tw', 'P@ssw0rd!');

    submit(fixture);
    httpMock.expectOne(loginUrl).flush('boom', { status: 500, statusText: 'Server Error' });

    const error = (fixture.componentInstance as unknown as { error: () => string }).error();
    expect(error).toBe('無法登入，請稍後再試。');
  });

  it('clears the submitting flag after a failure so the user can retry', () => {
    const fixture = setup();
    fill(fixture, 'miles@uuu.com.tw', 'wrong');

    submit(fixture);
    httpMock.expectOne(loginUrl).flush('no', { status: 401, statusText: 'Unauthorized' });

    const submitting = (fixture.componentInstance as unknown as {
      submitting: () => boolean;
    }).submitting();
    expect(submitting).toBeFalse();
  });
});
