import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-10 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive" />
          <h2 className="text-lg font-semibold text-foreground">Algo salió mal</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {this.state.error?.message || 'Error inesperado. Intente recargar la página.'}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="text-sm text-primary hover:underline"
          >
            Intentar de nuevo
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
