import { fireEvent, render, screen, within } from '@testing-library/react';
import App from './App';

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

test.each([false, true])('project deletion respects confirmation=%s and preserves other projects', (confirmed) => {
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
  const confirm = jest.spyOn(window, 'confirm').mockReturnValue(confirmed);
  render(<App />);

  const projectCard = screen.getByRole('heading', { name: 'Alrudhaa' }).closest('article');
  fireEvent.click(within(projectCard).getByRole('button', { name: 'Delete' }));

  expect(confirm).toHaveBeenCalledTimes(1);
  expect(confirm).toHaveBeenCalledWith('Delete project "Alrudhaa"?\n\nIts notes and payment records will also be deleted. This cannot be undone.');
  expect(JSON.parse(localStorage.getItem('wizard-schedules'))).toEqual(confirmed ? [projects[1]] : projects);
  expect(JSON.parse(localStorage.getItem('wizard-schedules-project-notes'))).toEqual(confirmed ? { 102: notes[102] } : notes);
  expect(screen.getByRole('heading', { name: 'Creativia' })).toBeInTheDocument();
  if (confirmed) {
    expect(screen.queryByRole('heading', { name: 'Alrudhaa' })).not.toBeInTheDocument();
  } else {
    expect(screen.getByRole('heading', { name: 'Alrudhaa' })).toBeInTheDocument();
  }
});
