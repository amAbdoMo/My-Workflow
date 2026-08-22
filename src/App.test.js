import { render, screen } from '@testing-library/react';
import App from './App';

test('renders WorkflowY dashboard heading', () => {
  render(<App />);
  const heading = screen.getByRole('heading', { name: /workflow\s*y/i });
  expect(heading).toBeInTheDocument();
});
