import { expect, test } from '@playwright/test';

type Style = {
  id: string;
  name: string;
  instructions: string;
  created_at: string;
  updated_at: string;
};

type NotePost = {
  id: string;
  post_text: string;
  length: 'short' | 'medium' | 'long';
  extra_instructions: string | null;
  style_id: string | null;
  style_name: string | null;
  style_instructions: string | null;
  generation_settings: Record<string, unknown>;
  created_at: string;
};

type Note = {
  id: string;
  heading: string;
  summary: string;
  input_text: string;
  dictated_text: string | null;
  created_at: string;
  updated_at: string;
  posts: NotePost[];
};

function nowIso() {
  return new Date().toISOString();
}

function noteUuid(seq: number) {
  return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
}

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page, label: string) {
  const metrics = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    docWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body ? document.body.scrollWidth : 0,
  }));

  const maxWidth = Math.max(metrics.docWidth, metrics.bodyWidth);
  expect(maxWidth, `${label} has horizontal overflow`).toBeLessThanOrEqual(metrics.innerWidth + 1);
}

async function installApiMocks(page: import('@playwright/test').Page) {
  const styles: Style[] = [];
  const notes: Note[] = [];

  let styleSeq = 1;
  let noteSeq = 1;
  let postSeq = 1;

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    const json = async (status: number, body: unknown) => {
      await route.fulfill({
        status,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    };

    if (path === '/api/styles' && method === 'GET') {
      await json(200, { styles });
      return;
    }

    if (path === '/api/styles' && method === 'POST') {
      const payload = request.postDataJSON() as Partial<Style>;
      if (!payload.name || !payload.instructions) {
        await json(400, { error: 'Style name and instructions are required' });
        return;
      }

      if (payload.id) {
        const existing = styles.find((s) => s.id === payload.id);
        if (!existing) {
          await json(404, { error: 'Style not found' });
          return;
        }
        existing.name = payload.name;
        existing.instructions = payload.instructions;
        existing.updated_at = nowIso();
        await json(200, { style: existing });
        return;
      }

      const style: Style = {
        id: `style-${styleSeq++}`,
        name: payload.name,
        instructions: payload.instructions,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      styles.unshift(style);
      await json(200, { style });
      return;
    }

    if (path.startsWith('/api/styles/') && method === 'DELETE') {
      const styleId = path.split('/').at(-1) || '';
      const index = styles.findIndex((s) => s.id === styleId);
      if (index >= 0) styles.splice(index, 1);
      await json(200, { ok: true });
      return;
    }

    if (path === '/api/notes' && method === 'GET') {
      const list = notes
        .map((n) => ({
          id: n.id,
          heading: n.heading,
          summary: n.summary,
          input_text: n.input_text,
          dictated_text: n.dictated_text,
          created_at: n.created_at,
          updated_at: n.updated_at,
        }))
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      await json(200, { notes: list });
      return;
    }

    if (path === '/api/notes' && method === 'POST') {
      const payload = request.postDataJSON() as Record<string, unknown>;
      const note: Note = {
        id: noteUuid(noteSeq++),
        heading: String(payload.heading || ''),
        summary: String(payload.summary || ''),
        input_text: String(payload.inputText || ''),
        dictated_text: payload.dictatedText ? String(payload.dictatedText) : null,
        created_at: nowIso(),
        updated_at: nowIso(),
        posts: [],
      };
      notes.unshift(note);
      await json(200, {
        note: {
          id: note.id,
          heading: note.heading,
          summary: note.summary,
          input_text: note.input_text,
          dictated_text: note.dictated_text,
          created_at: note.created_at,
          updated_at: note.updated_at,
        },
      });
      return;
    }

    const noteIdMatch = path.match(/^\/api\/notes\/([^/]+)$/);
    if (noteIdMatch && method === 'GET') {
      const note = notes.find((n) => n.id === noteIdMatch[1]);
      if (!note) {
        await json(404, { error: 'Not found' });
        return;
      }
      await json(200, {
        note: {
          id: note.id,
          heading: note.heading,
          summary: note.summary,
          input_text: note.input_text,
          dictated_text: note.dictated_text,
          created_at: note.created_at,
          updated_at: note.updated_at,
          posts: note.posts,
        },
      });
      return;
    }

    if (noteIdMatch && method === 'PATCH') {
      const note = notes.find((n) => n.id === noteIdMatch[1]);
      if (!note) {
        await json(404, { error: 'Not found' });
        return;
      }
      const payload = request.postDataJSON() as Record<string, unknown>;
      if (payload.inputText !== undefined) note.input_text = String(payload.inputText || '');
      if (payload.dictatedText !== undefined) {
        note.dictated_text = payload.dictatedText ? String(payload.dictatedText) : null;
      }
      if (payload.heading !== undefined) note.heading = String(payload.heading || '');
      if (payload.summary !== undefined) note.summary = String(payload.summary || '');
      note.updated_at = nowIso();
      await json(200, {
        note: {
          id: note.id,
          heading: note.heading,
          summary: note.summary,
          input_text: note.input_text,
          dictated_text: note.dictated_text,
          created_at: note.created_at,
          updated_at: note.updated_at,
        },
      });
      return;
    }

    if (noteIdMatch && method === 'DELETE') {
      const index = notes.findIndex((n) => n.id === noteIdMatch[1]);
      if (index === -1) {
        await json(404, { error: 'Not found' });
        return;
      }
      notes.splice(index, 1);
      await json(200, { ok: true });
      return;
    }

    const similarMatch = path.match(/^\/api\/notes\/([^/]+)\/similar$/);
    if (similarMatch && method === 'GET') {
      await json(200, { similar: [] });
      return;
    }

    const postMatch = path.match(/^\/api\/notes\/([^/]+)\/posts$/);
    if (postMatch && method === 'POST') {
      const note = notes.find((n) => n.id === postMatch[1]);
      if (!note) {
        await json(404, { error: 'Not found' });
        return;
      }
      const payload = request.postDataJSON() as Record<string, unknown>;
      const post: NotePost = {
        id: `post-${postSeq++}`,
        post_text: String(payload.postText || ''),
        length: (payload.length as NotePost['length']) || 'medium',
        extra_instructions: (payload.extraInstructions as string) || null,
        style_id: (payload.styleId as string) || null,
        style_name: (payload.styleName as string) || null,
        style_instructions: (payload.styleInstructions as string) || null,
        generation_settings: (payload.generationSettings as Record<string, unknown>) || {},
        created_at: nowIso(),
      };
      note.posts.unshift(post);
      await json(200, { post });
      return;
    }

    if (path === '/api/summary' && method === 'POST') {
      const payload = request.postDataJSON() as { text?: string };
      const text = String(payload.text || '').trim();
      await json(200, {
        heading: text ? 'Смок заголовок' : '',
        summary: text ? 'Смок саммари для проверки пользовательского потока.' : '',
      });
      return;
    }

    if (path === '/api/generate' && method === 'POST') {
      await json(200, {
        post: 'Смок-пост: это проверка генерации и сохранения.',
      });
      return;
    }

    if (path === '/api/transcribe' && method === 'POST') {
      await json(200, {
        text: 'Текст из транскриба (мок).',
      });
      return;
    }

    await json(404, { error: `No mock for ${method} ${path}` });
  });
}

test('smoke: settings -> style save, home -> create note, note -> append transcribe, generate, delete', async ({ page }) => {
  await installApiMocks(page);

  await page.goto('/settings');
  await page.getByPlaceholder('название стиля').fill('Founder voice');
  await page.getByPlaceholder('инструкции стиля').fill('Пиши кратко, конкретно, с тезисами.');
  await page.getByRole('button', { name: 'сохранить' }).click();
  await expect(page.locator('select option', { hasText: 'Founder voice' })).toHaveCount(1);

  await page.goto('/');
  await page.getByRole('button', { name: 'больше опций' }).click();
  await page.getByPlaceholder('вставь или напиши заметку здесь...').fill('Мы протестировали новый формат запуска фич.');
  await page.getByRole('button', { name: 'сохранить и открыть' }).click();
  await page.waitForURL(/\/notes\/[0-9a-f-]{36}$/);

  await page.locator('input[type="file"]').setInputFiles({
    name: 'clip.webm',
    mimeType: 'audio/webm',
    buffer: Buffer.from('fake-audio'),
  });
  await page.getByRole('button', { name: 'больше опций' }).click();
  await expect(page.locator('textarea.manual-area')).toHaveValue(
    'Мы протестировали новый формат запуска фич.\n\nТекст из транскриба (мок).',
  );

  await page.locator('select.style-select').selectOption({ label: 'Founder voice' });
  await page.getByPlaceholder('инструкции стиля').fill('Пиши кратко, конкретно, с тезисами.');
  await page
    .getByLabel('Панель дополнения заметки')
    .getByRole('button', { name: 'сгенерировать пост' })
    .click();

  await expect(page.locator('.post-output')).toContainText('Смок-пост: это проверка генерации и сохранения.');
  await expect(page.getByText('История генераций')).toBeVisible();

  page.once('dialog', async (dialog) => {
    await dialog.accept();
  });
  await page
    .getByLabel('Панель дополнения заметки')
    .getByRole('button', { name: 'удалить заметку' })
    .click();
  await page.waitForURL('/');

  await page.goto('/');
  await expect(page.getByText('Смок заголовок')).toHaveCount(0);
});

test('mobile: no horizontal overflow on key screens', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installApiMocks(page);

  await page.goto('/');
  await expectNoHorizontalOverflow(page, 'home screen');

  await page.getByRole('button', { name: 'больше опций' }).click();
  await page.getByPlaceholder('вставь или напиши заметку здесь...').fill('Тест мобильной ширины экрана.');
  await page.getByRole('button', { name: 'сохранить и открыть' }).click();
  await page.waitForURL(/\/notes\/[0-9a-f-]{36}$/);
  await expectNoHorizontalOverflow(page, 'note screen');

  await page.goto('/settings');
  await expectNoHorizontalOverflow(page, 'settings screen');
});
