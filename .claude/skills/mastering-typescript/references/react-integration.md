# React Integration Reference

> **Load when:** User asks about React with TypeScript, typed components, hooks, state management, or React patterns.

Type-safe React development patterns for React 19+.

## Contents

- [Component Patterns](#component-patterns)
- [Hooks with TypeScript](#hooks-with-typescript)
- [State Management](#state-management)
- [Event Handling](#event-handling)
- [Context API](#context-api)

---

## Component Patterns

### Functional Components

```typescript
// Basic typed component
interface GreetingProps {
  name: string;
  age?: number;
}

function Greeting({ name, age }: GreetingProps) {
  return (
    <div>
      Hello, {name}!
      {age && <span> You are {age} years old.</span>}
    </div>
  );
}

// With React.FC (optional, some prefer explicit return type)
const GreetingFC: React.FC<GreetingProps> = ({ name, age }) => {
  return <div>Hello, {name}!</div>;
};

// Component with children
interface CardProps {
  title: string;
  children: React.ReactNode;
}

function Card({ title, children }: CardProps) {
  return (
    <div className="card">
      <h2>{title}</h2>
      <div className="card-body">{children}</div>
    </div>
  );
}
```

### Generic Components

```typescript
// Generic list component
interface ListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T) => string;
}

function List<T>({ items, renderItem, keyExtractor }: ListProps<T>) {
  return (
    <ul>
      {items.map((item, index) => (
        <li key={keyExtractor(item)}>{renderItem(item, index)}</li>
      ))}
    </ul>
  );
}

// Usage
interface User {
  id: string;
  name: string;
}

<List<User>
  items={users}
  keyExtractor={(user) => user.id}
  renderItem={(user) => <span>{user.name}</span>}
/>;

// Generic select component
interface SelectProps<T> {
  options: T[];
  value: T | null;
  onChange: (value: T) => void;
  getLabel: (option: T) => string;
  getValue: (option: T) => string;
}

function Select<T>({
  options,
  value,
  onChange,
  getLabel,
  getValue
}: SelectProps<T>) {
  return (
    <select
      value={value ? getValue(value) : ""}
      onChange={(e) => {
        const selected = options.find((opt) => getValue(opt) === e.target.value);
        if (selected) onChange(selected);
      }}
    >
      <option value="">Select...</option>
      {options.map((opt) => (
        <option key={getValue(opt)} value={getValue(opt)}>
          {getLabel(opt)}
        </option>
      ))}
    </select>
  );
}
```

### Polymorphic Components

```typescript
// Component that can render as different elements
type ButtonProps<T extends React.ElementType> = {
  as?: T;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "children">;

function Button<T extends React.ElementType = "button">({
  as,
  children,
  variant = "primary",
  ...props
}: ButtonProps<T>) {
  const Component = as || "button";
  return (
    <Component className={`btn btn-${variant}`} {...props}>
      {children}
    </Component>
  );
}

// Usage
<Button>Click me</Button>
<Button as="a" href="/about">Link Button</Button>
<Button as={Link} to="/home">Router Link</Button>
```

---

## Hooks with TypeScript

### useState

```typescript
// Basic usage (type inferred)
const [count, setCount] = useState(0);

// Explicit type (for complex types or initial null)
const [user, setUser] = useState<User | null>(null);

// With union types
type Status = "idle" | "loading" | "success" | "error";
const [status, setStatus] = useState<Status>("idle");

// Lazy initialization
const [state, setState] = useState<ExpensiveState>(() => {
  return computeExpensiveInitialState();
});
```

### useRef

```typescript
// DOM element ref
const inputRef = useRef<HTMLInputElement>(null);

function focusInput() {
  inputRef.current?.focus();
}

// Mutable ref (no initial render)
const intervalRef = useRef<NodeJS.Timeout | null>(null);

useEffect(() => {
  intervalRef.current = setInterval(() => {}, 1000);
  return () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
  };
}, []);

// Ref to store previous value
function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref.current;
}
```

### useReducer

```typescript
// Define state and actions
interface CounterState {
  count: number;
  step: number;
}

type CounterAction =
  | { type: "increment" }
  | { type: "decrement" }
  | { type: "setStep"; payload: number }
  | { type: "reset" };

function counterReducer(
  state: CounterState,
  action: CounterAction
): CounterState {
  switch (action.type) {
    case "increment":
      return { ...state, count: state.count + state.step };
    case "decrement":
      return { ...state, count: state.count - state.step };
    case "setStep":
      return { ...state, step: action.payload };
    case "reset":
      return { count: 0, step: 1 };
  }
}

// Usage
const [state, dispatch] = useReducer(counterReducer, { count: 0, step: 1 });

dispatch({ type: "increment" });
dispatch({ type: "setStep", payload: 5 });
```

### Custom Hooks

```typescript
// Async data fetching hook
interface UseAsyncResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

function useAsync<T>(
  asyncFn: () => Promise<T>,
  deps: React.DependencyList = []
): UseAsyncResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await asyncFn();
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, deps);

  useEffect(() => {
    execute();
  }, [execute]);

  return { data, loading, error, refetch: execute };
}

// Usage
const { data: users, loading, error } = useAsync(
  () => fetch("/api/users").then((r) => r.json()),
  []
);

// Local storage hook
function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = (value: T | ((prev: T) => T)) => {
    const valueToStore = value instanceof Function ? value(storedValue) : value;
    setStoredValue(valueToStore);
    localStorage.setItem(key, JSON.stringify(valueToStore));
  };

  return [storedValue, setValue];
}
```

---

## State Management

### Zustand with TypeScript

```typescript
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

// Define state interface
interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User) => void;
}

// Create typed store
const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      (set) => ({
        user: null,
        token: null,
        isAuthenticated: false,

        login: async (email, password) => {
          const response = await api.login(email, password);
          set({
            user: response.user,
            token: response.token,
            isAuthenticated: true
          });
        },

        logout: () => {
          set({ user: null, token: null, isAuthenticated: false });
        },

        setUser: (user) => set({ user })
      }),
      { name: 'auth-storage' }
    )
  )
);

// Usage with selectors
const user = useAuthStore((state) => state.user);
const login = useAuthStore((state) => state.login);

// Shallow comparison for multiple values
import { useShallow } from 'zustand/react/shallow';

const { user, isAuthenticated } = useAuthStore(
  useShallow((state) => ({
    user: state.user,
    isAuthenticated: state.isAuthenticated
  }))
);
```

### Redux Toolkit with TypeScript

```typescript
import { createSlice, PayloadAction, configureStore } from '@reduxjs/toolkit';

// Define slice state
interface TodosState {
  items: Todo[];
  filter: "all" | "active" | "completed";
  loading: boolean;
}

const initialState: TodosState = {
  items: [],
  filter: "all",
  loading: false
};

// Create typed slice
const todosSlice = createSlice({
  name: "todos",
  initialState,
  reducers: {
    addTodo: (state, action: PayloadAction<string>) => {
      state.items.push({
        id: crypto.randomUUID(),
        text: action.payload,
        completed: false
      });
    },
    toggleTodo: (state, action: PayloadAction<string>) => {
      const todo = state.items.find((t) => t.id === action.payload);
      if (todo) {
        todo.completed = !todo.completed;
      }
    },
    setFilter: (state, action: PayloadAction<TodosState["filter"]>) => {
      state.filter = action.payload;
    }
  }
});

// Configure store with type inference
const store = configureStore({
  reducer: {
    todos: todosSlice.reducer
  }
});

// Infer types from store
type RootState = ReturnType<typeof store.getState>;
type AppDispatch = typeof store.dispatch;

// Typed hooks
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';

const useAppDispatch = () => useDispatch<AppDispatch>();
const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// Usage
const todos = useAppSelector((state) => state.todos.items);
const dispatch = useAppDispatch();
dispatch(todosSlice.actions.addTodo("New todo"));
```

---

## Event Handling

### Common Event Types

```typescript
// Click events
function handleClick(event: React.MouseEvent<HTMLButtonElement>) {
  console.log(event.currentTarget.name);
}

// Form events
function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
}

// Input change
function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
  const { name, value, checked, type } = event.target;
  const inputValue = type === "checkbox" ? checked : value;
}

// Keyboard events
function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter") {
    event.preventDefault();
    // submit form
  }
}

// Focus events
function handleFocus(event: React.FocusEvent<HTMLInputElement>) {
  event.target.select();
}

// Drag events
function handleDrag(event: React.DragEvent<HTMLDivElement>) {
  event.dataTransfer.setData("text/plain", "dragged data");
}
```

### Form with TypeScript

```typescript
interface FormData {
  name: string;
  email: string;
  role: "user" | "admin";
}

function RegistrationForm() {
  const [formData, setFormData] = useState<FormData>({
    name: "",
    email: "",
    role: "user"
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log(formData);
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        name="name"
        value={formData.name}
        onChange={handleChange}
      />
      <input
        name="email"
        type="email"
        value={formData.email}
        onChange={handleChange}
      />
      <select name="role" value={formData.role} onChange={handleChange}>
        <option value="user">User</option>
        <option value="admin">Admin</option>
      </select>
      <button type="submit">Register</button>
    </form>
  );
}
```

---

## Context API

### Typed Context

```typescript
// Define context type
interface ThemeContextType {
  theme: "light" | "dark";
  toggleTheme: () => void;
}

// Create context with undefined default
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Provider component
function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  const value = useMemo(() => ({ theme, toggleTheme }), [theme, toggleTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// Custom hook with type safety
function useTheme(): ThemeContextType {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}

// Usage
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>Current: {theme}</button>;
}
```

### Generic Context Factory

```typescript
// Factory function for creating typed contexts
function createContext<T>(displayName: string) {
  const Context = React.createContext<T | undefined>(undefined);
  Context.displayName = displayName;

  function useContextHook(): T {
    const context = React.useContext(Context);
    if (context === undefined) {
      throw new Error(`use${displayName} must be used within ${displayName}Provider`);
    }
    return context;
  }

  return [Context.Provider, useContextHook] as const;
}

// Usage
interface AuthContextType {
  user: User | null;
  login: (credentials: Credentials) => Promise<void>;
  logout: () => void;
}

const [AuthProvider, useAuth] = createContext<AuthContextType>("Auth");
```
