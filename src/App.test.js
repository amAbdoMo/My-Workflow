import { fireEvent, render, screen, within } from '@testing-library/react';
import { StrictMode } from 'react';
import App from './App';

// jsdom does not implement the browser dialog API; real Electron checks cover modal behavior.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});

afterAll(() => {
  delete HTMLDialogElement.prototype.showModal;
  delete HTMLDialogElement.prototype.close;
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  jest.restoreAllMocks();
  localStorage.clear();
});

test('renders WorkflowY dashboard heading', () => {
  render(<App />);
  const heading = screen.getByRole('heading', { name: /workflow\s*y/i });
  expect(heading).toBeInTheDocument();
});

test.each(['Cancel', 'Close', 'Escape', 'Delete project'])('in-app project deletion via %s preserves the correct data', (action) => {
  const confirmed = action === 'Delete project';
  const projects = [
    { id: 101, name: 'Alrudhaa', start: '20/03/2026', deadline: '09/04/2026', payments: [{ id: 'payment-1', amount: 500, currency: 'EGP' }] },
    { id: 102, name: 'Creativia', start: '22/09/2026', deadline: '23/09/2026' },
  ];
  const notes = {
    101: [{ id: 'note-1', text: 'Project details', done: false }],
    102: [{ id: 'note-2', text: 'Keep these notes', done: false }],
  };
  localStorage.setItem('wizard-schedules', JSON.stringify(projects));
  localStorage.setItem('wizard-schedules-project-notes', JSON.stringify(notes));
  const nativeConfirm = jest.spyOn(window, 'confirm').mockReturnValue(false);
  render(<StrictMode><App /></StrictMode>);

  const projectCard = screen.getByRole('heading', { name: 'Alrudhaa' }).closest('article');
  fireEvent.click(within(projectCard).getByRole('button', { name: 'Delete' }));

  const dialog = screen.getByRole('dialog', { name: 'Delete project?' });
  expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  expect(dialog).toHaveTextContent('Alrudhaa');
  expect(dialog).toHaveTextContent('notes and payment records');
  expect(dialog).toHaveTextContent('cannot be undone');
  expect(JSON.parse(localStorage.getItem('wizard-schedules'))).toEqual(projects);
  expect(JSON.parse(localStorage.getItem('wizard-schedules-project-notes'))).toEqual(notes);

  if (action === 'Escape') {
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
  } else {
    fireEvent.click(within(dialog).getByRole('button', { name: action === 'Close' ? 'Cancel project deletion' : action }));
  }

  expect(nativeConfirm).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(JSON.parse(localStorage.getItem('wizard-schedules'))).toEqual(confirmed ? [projects[1]] : projects);
  expect(JSON.parse(localStorage.getItem('wizard-schedules-project-notes'))).toEqual(confirmed ? { 102: notes[102] } : notes);
  expect(screen.getByRole('heading', { name: 'Creativia' })).toBeInTheDocument();
  if (confirmed) {
    expect(screen.getByRole('region', { name: 'Projects' })).toHaveFocus();
    expect(screen.queryByRole('heading', { name: 'Alrudhaa' })).not.toBeInTheDocument();
  } else {
    expect(screen.getByRole('heading', { name: 'Alrudhaa' })).toBeInTheDocument();
  }
});
