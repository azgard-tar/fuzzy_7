/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  ThemeProvider,
  createTheme,
  CssBaseline,
  Container,
  Paper,
  Box,
  Typography,
  Grid,
  TextField,
  Button,
  Table,
  TableContainer,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Select,
  MenuItem,
  Tabs,
  Tab,
  AppBar,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  FormHelperText,
} from "@mui/material";
import ArrowBackIosNewIcon from "@mui/icons-material/ArrowBackIosNew";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
import EditIcon from "@mui/icons-material/Edit";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";

// Chart.js imports for Fig. 1
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  Legend,
  Filler
);

// --- Types ---

type TriangularNumber = {
  l: number;
  m: number;
  u: number;
};

type LinguisticTerm = {
  id: string;
  name: string;
  shortName: string;
  value: number; // Saaty scale value (1-9)
  tri: TriangularNumber;
};

type MatrixCell = {
  tri: TriangularNumber;
  isInverse: boolean; // true if calculated automatically as 1/x
  saatyValue?: number; // references the base scale, e.g. 3 for (2,3,4)
};

// --- Math Helpers ---

const T_ONE: TriangularNumber = { l: 1, m: 1, u: 1 };
const PRECISION = 4;

const formatNumber = (num: number, precision = PRECISION): string => {
  if (isNaN(num)) return 'NaN';
  if (Math.abs(num - Math.round(num)) < 0.0001) {
    return Math.round(num).toString();
  }
  return num.toFixed(precision);
};

const formatFraction = (num: number): string => {
  if (num === 1) return "1";
  if (Math.abs(num - 1/2) < 0.0001) return "1/2";
  if (Math.abs(num - 1/3) < 0.0001) return "1/3";
  if (Math.abs(num - 1/4) < 0.0001) return "1/4";
  if (Math.abs(num - 1/5) < 0.0001) return "1/5";
  if (Math.abs(num - 1/6) < 0.0001) return "1/6";
  if (Math.abs(num - 1/7) < 0.0001) return "1/7";
  if (Math.abs(num - 1/8) < 0.0001) return "1/8";
  if (Math.abs(num - 1/9) < 0.0001) return "1/9";
  
  // Fallback to decimal if not a simple inverse
  return formatNumber(num, 3);
};

// Formats a triangular number for display
const formatTri = (t: TriangularNumber, precision = PRECISION): string => 
  `(${formatNumber(t.l, precision)}, ${formatNumber(t.m, precision)}, ${formatNumber(t.u, precision)})`;

const formatTriInverse = (t: TriangularNumber): string => 
  `(${formatFraction(t.l)}, ${formatFraction(t.m)}, ${formatFraction(t.u)})`;

// Inverse of a triangular number (1/u, 1/m, 1/l)
const fuzzyInverse = (t: TriangularNumber): TriangularNumber => ({
  l: t.u !== 0 ? 1 / t.u : 0,
  m: t.m !== 0 ? 1 / t.m : 0,
  u: t.l !== 0 ? 1 / t.l : 0,
});

// Multiplication of two triangular numbers
const fuzzyMultiply = (t1: TriangularNumber, t2: TriangularNumber): TriangularNumber => ({
  l: t1.l * t2.l,
  m: t1.m * t2.m,
  u: t1.u * t2.u,
});

// Geometric mean of an array of triangular numbers (Step 2, Eq. 2)
const fuzzyGeoMean = (numbers: TriangularNumber[]): TriangularNumber => {
  const n = numbers.length;
  let prodL = 1, prodM = 1, prodU = 1;
  numbers.forEach(num => {
    prodL *= num.l;
    prodM *= num.m;
    prodU *= num.u;
  });
  return {
    l: Math.pow(prodL, 1 / n),
    m: Math.pow(prodM, 1 / n),
    u: Math.pow(prodU, 1 / n),
  };
};

// Sum of triangular numbers (Step 3a, Eq. 3)
const fuzzySum = (numbers: TriangularNumber[]): TriangularNumber => {
  return numbers.reduce((acc, curr) => ({
    l: acc.l + curr.l,
    m: acc.m + curr.m,
    u: acc.u + curr.u,
  }), { l: 0, m: 0, u: 0 });
};

// Center of Area (Defuzzification) (Step 4, Eq. 6)
const centerOfArea = (t: TriangularNumber): number => {
  return (t.l + t.m + t.u) / 3;
};

// --- Constants & Initial Data ---

const DEFAULT_TERMS: LinguisticTerm[] = [
  { id: "1", name: "Equally important", shortName: "EI", value: 1, tri: { l: 1, m: 1, u: 1 } },
  { id: "2", name: "Intermediate value", shortName: "IV13", value: 2, tri: { l: 1, m: 2, u: 3 } },
  { id: "3", name: "Weakly important", shortName: "WI", value: 3, tri: { l: 2, m: 3, u: 4 } },
  { id: "4", name: "Intermediate value", shortName: "IV35", value: 4, tri: { l: 3, m: 4, u: 5 } },
  { id: "5", name: "Fairly important", shortName: "FI", value: 5, tri: { l: 4, m: 5, u: 6 } },
  { id: "6", name: "Intermediate value", shortName: "IV57", value: 6, tri: { l: 5, m: 6, u: 7 } },
  { id: "7", name: "Strongly important", shortName: "SI", value: 7, tri: { l: 6, m: 7, u: 8 } },
  { id: "8", name: "Intermediate value", shortName: "IV79", value: 8, tri: { l: 7, m: 8, u: 9 } },
  { id: "9", name: "Absolutely important", shortName: "AI", value: 9, tri: { l: 9, m: 9, u: 9 } },
];

const INITIAL_CRITERIA_NAMES = [
  "C1 (cargo support)",
  "C2 (cargo insurance)",
  "C3 (vehicle monitoring)",
  "C4 (cargo safety)",
  "C5 (timeliness of delivery)",
];
const INITIAL_ALT_NAMES = [
  "A1 (Company A)",
  "A2 (Company B)",
  "A3 (Company C)",
];

// Initial Data Generation
const getTriForValue = (val: number, terms: LinguisticTerm[]): TriangularNumber => {
  if (val >= 1) {
    const t = terms.find(t => t.value === val);
    return t ? t.tri : T_ONE;
  } else {
    // Inverse
    const baseVal = Math.round(1/val);
    const t = terms.find(t => t.value === baseVal);
    return t ? fuzzyInverse(t.tri) : T_ONE;
  }
};

const getInitialMatrix = (size: number, terms: LinguisticTerm[], initialData: Record<string, number> = {}) => {
    const matrix = Array(size).fill(0).map(() => Array(size).fill(null).map(() => ({ tri: T_ONE, isInverse: false, saatyValue: 1 })));

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (r === c) continue;
        
        // Check if we have pre-defined data for upper triangle
        if (r < c) {
            const key = `${r}-${c}`;
            if (initialData[key]) {
                const val = initialData[key];
                matrix[r][c] = {
                    tri: getTriForValue(val, terms),
                    isInverse: val < 1,
                    saatyValue: val
                };
            }
        } else {
            // Lower triangle is inverse of upper
            const upper = matrix[c][r];
            const val = upper.saatyValue || 1;
            matrix[r][c] = {
                tri: fuzzyInverse(upper.tri),
                isInverse: true,
                saatyValue: 1/val // Store the actual numeric relationship
            };
        }
      }
    }
    return matrix;
};

// Initial Data Maps
const initialCritValues = {
    "0-1": 3, "0-2": 4, "0-3": 1, "0-4": 1/2,
    "1-2": 2, "1-3": 1/3, "1-4": 1,
    "2-3": 1/5, "2-4": 1/3,
    "3-4": 1/2,
};

const initialAlt1Values = { "0-1": 2, "0-2": 4, "1-2": 3 };
const initialAlt2Values = { "0-1": 1/3, "0-2": 1/5, "1-2": 1/3 };
const initialAlt3Values = { "0-1": 1/3, "0-2": 2, "1-2": 3 };
const initialAlt4Values = { "0-1": 1, "0-2": 2, "1-2": 2 };
const initialAlt5Values = { "0-1": 2, "0-2": 1/3, "1-2": 1/4 };


const getInitialCritMatrixState = () => getInitialMatrix(5, DEFAULT_TERMS, initialCritValues);

const getInitialAltMatricesState = () => [
    getInitialMatrix(3, DEFAULT_TERMS, initialAlt1Values),
    getInitialMatrix(3, DEFAULT_TERMS, initialAlt2Values),
    getInitialMatrix(3, DEFAULT_TERMS, initialAlt3Values),
    getInitialMatrix(3, DEFAULT_TERMS, initialAlt4Values),
    getInitialMatrix(3, DEFAULT_TERMS, initialAlt5Values),
];


// --- Theming ---
const theme = createTheme({
  palette: {
    primary: { main: "#1976d2" },
    secondary: { main: "#dc004e" },
    success: { main: "#4caf50", contrastText: "#fff" },
    background: { default: "#f5f5f5", paper: "#ffffff" },
  },
  typography: {
    fontFamily: '"Roboto", "Helvetica", "Arial", sans-serif',
    h5: { fontWeight: 600 },
    h6: { fontWeight: 500 },
  },
  components: {
    MuiTableCell: {
      styleOverrides: {
        root: { padding: "8px 16px" },
        head: { fontWeight: 700, backgroundColor: "#e0e0e0" },
      },
    },
    MuiPaper: {
        styleOverrides: {
          root: { borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" },
        },
      },
  },
});

// --- Components ---

const TermChart: React.FC<{ terms: LinguisticTerm[] }> = ({ terms }) => {
  const data = useMemo(() => {
    const datasets = terms.map((term, index) => {
      const points = [
        { x: term.tri.l, y: 0 },
        { x: term.tri.m, y: 1 },
        { x: term.tri.u, y: 0 },
      ];
      const color = `hsl(${(index * 360) / terms.length}, 70%, 50%)`;
      return {
        label: `${term.shortName} (${term.value})`,
        data: points,
        borderColor: color,
        backgroundColor: color.replace('50%)', '50%, 0.1)'),
        borderWidth: 2,
        fill: true,
        tension: 0,
        showLine: true,
      };
    });
    return { datasets };
  }, [terms]);

  const allValues = terms.flatMap(t => [t.tri.l, t.tri.m, t.tri.u]);
  const minX = Math.min(...allValues, 0);
  const maxX = Math.max(...allValues, 9) + 1;

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        type: 'linear' as const,
        min: minX,
        max: maxX,
        title: { display: true, text: 'Saaty Scale / Fuzzy Scale' }
      },
      y: { min: 0, max: 1.1, title: { display: true, text: 'Membership Degree (µ)' } }
    },
    plugins: {
      legend: { position: 'bottom' as const },
      tooltip: { callbacks: { label: (ctx: any) => `${ctx.dataset.label}: x=${formatNumber(ctx.parsed.x, 2)}, µ=${formatNumber(ctx.parsed.y, 2)}` } }
    }
  };

  return (
    <Box sx={{ height: 300, width: '100%', mt: 2, mb: 4 }}>
      <Line data={data} options={options} />
    </Box>
  );
};

const LinguisticTermEditor: React.FC<{
  open: boolean;
  onClose: () => void;
  terms: LinguisticTerm[];
  onSave: (terms: LinguisticTerm[]) => void;
}> = ({ open, onClose, terms, onSave }) => {
  const [localTerms, setLocalTerms] = useState(terms);
  const [errors, setErrors] = useState<Record<string, { [key: string]: string }>>({});

  useEffect(() => {
    if (open) {
        setLocalTerms([...terms].sort((a, b) => a.value - b.value)); 
        setErrors({});
    }
  }, [open, terms]);

  const validate = useCallback((currentTerms: LinguisticTerm[]): Record<string, { [key: string]: string }> => {
    const newErrors: Record<string, { [key: string]: string }> = {};
    const shortNames = new Set<string>();
    const values = new Set<number>();

    currentTerms.forEach(term => {
        const termErrors: { [key: string]: string } = {};
        if (term.shortName.trim() === '') termErrors.shortName = "Обов'язково";
        else if (shortNames.has(term.shortName.trim())) termErrors.shortName = "Дублікат";
        shortNames.add(term.shortName.trim());

        if (values.has(term.value)) termErrors.value = "Дублікат";
        values.add(term.value);

        const { l, m, u } = term.tri;
        if (l > m) termErrors.l = "l ≤ m";
        if (m > u) termErrors.m = "m ≤ u";
        
        if (Object.keys(termErrors).length > 0) newErrors[term.id] = termErrors;
    });
    return newErrors;
  }, []);

  const handleChange = (idx: number, field: keyof TriangularNumber | 'shortName' | 'name' | 'value', val: string) => {
    const newTerms = [...localTerms];
    const newTerm = { ...newTerms[idx] };
    if (field === 'l' || field === 'm' || field === 'u') {
        const num = parseFloat(val);
        newTerm.tri = { ...newTerm.tri, [field]: isNaN(num) ? 0 : num };
    } else if (field === 'value') {
        const num = parseInt(val, 10);
        newTerm.value = isNaN(num) ? 0 : num;
    } else {
        (newTerm as any)[field] = val;
    }
    newTerms[idx] = newTerm;
    setLocalTerms(newTerms);
  };
  
  const handleSave = () => {
    const newErrors = validate(localTerms);
    if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
    }
    onSave(localTerms);
    onClose();
  };
  
  useEffect(() => {
    if (open) setErrors(validate(localTerms));
  }, [localTerms, open, validate]);

  const addTerm = () => {
    const nextValue = localTerms.length > 0 ? Math.max(...localTerms.map(t => t.value)) + 1 : 1;
    setLocalTerms(prev => [...prev, {
        id: crypto.randomUUID(),
        name: `New Term ${nextValue}`,
        shortName: `T${nextValue}`,
        value: nextValue,
        tri: { l: nextValue, m: nextValue + 1, u: nextValue + 2 }
    }]);
  };

  const deleteTerm = (id: string) => {
    setLocalTerms(prev => prev.filter(t => t.id !== id));
  };
  
  const hasGlobalError = Object.keys(errors).length > 0 || localTerms.length < 2;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Редагування лінгвістичних термів</DialogTitle>
      <DialogContent>
        <Stack spacing={3}>
            <TermChart terms={localTerms} />
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Значення</TableCell>
                    <TableCell>Коротка назва</TableCell>
                    <TableCell>Визначення</TableCell>
                    <TableCell align="center">L (мін)</TableCell>
                    <TableCell align="center">M (сер)</TableCell>
                    <TableCell align="center">U (макс)</TableCell>
                    <TableCell align="center">Дія</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {localTerms.map((term, idx) => (
                    <TableRow key={term.id}>
                      <TableCell>
                        <TextField size="small" type="number" value={term.value} onChange={e => handleChange(idx, 'value', e.target.value)} sx={{ width: 60 }} 
                           error={!!errors[term.id]?.value} helperText={errors[term.id]?.value}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField size="small" value={term.shortName} onChange={e => handleChange(idx, 'shortName', e.target.value)} sx={{ width: 80 }} 
                           error={!!errors[term.id]?.shortName} helperText={errors[term.id]?.shortName}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField size="small" value={term.name} onChange={e => handleChange(idx, 'name', e.target.value)} fullWidth />
                      </TableCell>
                      <TableCell>
                        <TextField size="small" type="number" value={term.tri.l} onChange={e => handleChange(idx, 'l', e.target.value)} sx={{ width: 80 }} 
                           error={!!errors[term.id]?.l} helperText={errors[term.id]?.l}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField size="small" type="number" value={term.tri.m} onChange={e => handleChange(idx, 'm', e.target.value)} sx={{ width: 80 }} 
                           error={!!errors[term.id]?.m} helperText={errors[term.id]?.m}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField size="small" type="number" value={term.tri.u} onChange={e => handleChange(idx, 'u', e.target.value)} sx={{ width: 80 }} 
                           error={!!errors[term.id]?.u} helperText={errors[term.id]?.u}
                        />
                      </TableCell>
                      <TableCell align="center">
                          <IconButton onClick={() => deleteTerm(term.id)} disabled={localTerms.length <= 2}>
                              <DeleteIcon fontSize="small"/>
                          </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Button startIcon={<AddIcon />} onClick={addTerm} sx={{ alignSelf: 'flex-start' }}>Додати новий терм</Button>
            {localTerms.length < 2 && (
                <FormHelperText error sx={{ textAlign: 'center' }}>Потрібно мінімум 2 терми для порівнянь.</FormHelperText>
            )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Скасувати</Button>
        <Button onClick={handleSave} variant="contained" disabled={hasGlobalError}>Зберегти</Button>
      </DialogActions>
    </Dialog>
  );
};

const PairwiseMatrixInput: React.FC<{
  items: string[];
  matrix: MatrixCell[][];
  onChange: (r: number, c: number, termValue: number) => void;
  terms: LinguisticTerm[];
  title: string;
}> = ({ items, matrix, onChange, terms, title }) => {

  const options = useMemo(() => {
    const sortedTerms = [...terms].sort((a, b) => a.value - b.value);
    const opts: Array<{ value: number; label: string; tri: TriangularNumber }> = [];
    
    // 1. Standard Terms
    sortedTerms.forEach(t => opts.push({ value: t.value, label: t.shortName, tri: t.tri }));

    // 2. Inverse Terms (skip 1)
    sortedTerms.filter(t => t.value > 1).forEach(t => {
        opts.push({ value: 1 / t.value, label: `Inverse ${t.shortName}`, tri: fuzzyInverse(t.tri) });
    });
    return opts;
  }, [terms]);
  
  const getCurrentSelectValue = (cell: MatrixCell): number => cell.saatyValue || 1;

  return (
    <Paper sx={{ p: 2, mb: 3, overflowX: 'auto' }}>
      <Typography variant="h6" gutterBottom color="primary">{title}</Typography>
      <Table size="small" sx={{ minWidth: 650 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ backgroundColor: "#fff" }}>Vs.</TableCell>
            {items.map((item, idx) => (
              <TableCell key={idx} align="center" sx={{ maxWidth: 100, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {item.split('(')[0].trim()}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {items.map((rowItem, r) => (
            <TableRow key={r}>
              <TableCell component="th" scope="row" sx={{ fontWeight: "bold", maxWidth: 150 }}>
                {rowItem.split('(')[0].trim()}
              </TableCell>
              {items.map((_colItem, c) => {
                const isDiagonal = r === c;
                const isLowerTriangle = r > c;
                const cell = matrix[r][c];

                if (isDiagonal) {
                  return <TableCell key={c} align="center" sx={{ bgcolor: "#f5f5f5" }}>(1,1,1)</TableCell>;
                }

                if (isLowerTriangle) {
                  return (
                    <TableCell key={c} align="center" sx={{ bgcolor: "#fafafa", color: "text.secondary", fontSize: "0.8rem" }}>
                      {formatTriInverse(cell.tri)}
                    </TableCell>
                  );
                }

                return (
                  <TableCell key={c} align="center">
                    <Select
                      value={getCurrentSelectValue(cell)}
                      onChange={(e) => onChange(r, c, Number(e.target.value))}
                      size="small"
                      fullWidth
                      sx={{ fontSize: "0.85rem" }}
                      renderValue={(selected) => {
                         const opt = options.find(o => Math.abs(o.value - selected) < 0.0001);
                         return opt ? (selected >= 1 ? formatTri(opt.tri) : formatTriInverse(opt.tri)) : formatNumber(selected);
                      }}
                    >
                      {options.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
                    </Select>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Paper>
  );
};


// --- Result Tables ---

const TableFuzzyWeights: React.FC<{
  criteriaNames: string[];
  critGeoMeans: TriangularNumber[];
  critFuzzyWeights: TriangularNumber[];
  sumCritGeoMeans: TriangularNumber;
  invSumCrit: TriangularNumber;
}> = ({ criteriaNames, critGeoMeans, critFuzzyWeights, sumCritGeoMeans, invSumCrit }) => (
    <TableContainer component={Paper} sx={{ mb: 3 }}>
        <Typography variant="h6" sx={{ p: 2, pb: 1, bgcolor: '#e3f2fd' }}>Таблиця 3. Геометричне середнє нечітких порівнянь (r)</Typography>
        <Table size="small">
            <TableHead>
                <TableRow>
                    <TableCell>Критерій</TableCell>
                    <TableCell align="center">r (Geometric Mean)</TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
                {criteriaNames.map((name, i) => (
                    <TableRow key={i}>
                        <TableCell>{name}</TableCell>
                        <TableCell align="center">{formatTri(critGeoMeans[i])}</TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
        <Typography variant="h6" sx={{ p: 2, pb: 1, bgcolor: '#e3f2fd', mt: 2 }}>Таблиця 4. Нечіткі ваги (w)</Typography>
        <Table size="small">
            <TableHead>
                <TableRow>
                    <TableCell>Критерій</TableCell>
                    <TableCell align="center">w (Fuzzy Weight)</TableCell>
                </TableRow>
            </TableHead>
            <TableBody>
                {criteriaNames.map((name, i) => (
                    <TableRow key={i}>
                        <TableCell>{name}</TableCell>
                        <TableCell align="center">{formatTri(critFuzzyWeights[i])}</TableCell>
                    </TableRow>
                ))}
                <TableRow sx={{ bgcolor: '#fff3e0' }}>
                    <TableCell colSpan={2}>
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            Vector Sum (sr): {formatTri(sumCritGeoMeans, 3)}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            Inversion Vector (isr): {formatTriInverse(invSumCrit)} = {formatTri(invSumCrit, 4)}
                        </Typography>
                    </TableCell>
                </TableRow>
            </TableBody>
        </Table>
    </TableContainer>
);

const TableNormalizedWeights: React.FC<{
  criteriaNames: string[];
  critFuzzyWeights: TriangularNumber[];
  critNormWeights: number[];
}> = ({ criteriaNames, critFuzzyWeights, critNormWeights }) => {
    const critDefuzzified = critFuzzyWeights.map(w => centerOfArea(w));
    const sumCritDefuzz = critDefuzzified.reduce((a, b) => a + b, 0);

    return (
        <TableContainer component={Paper} sx={{ mb: 3 }}>
            <Typography variant="h6" sx={{ p: 2, pb: 1, bgcolor: '#e3f2fd' }}>Таблиця 5. Дефазифіковані ваги (M)</Typography>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>Критерій</TableCell>
                        <TableCell align="center">M (Defuzzified)</TableCell>
                        <TableCell align="center">Формула (w)</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {criteriaNames.map((name, i) => (
                        <TableRow key={i}>
                            <TableCell>{name}</TableCell>
                            <TableCell align="center">{formatNumber(critDefuzzified[i])}</TableCell>
                            <TableCell align="center">
                                ({formatNumber(critFuzzyWeights[i].l, 2)} + {formatNumber(critFuzzyWeights[i].m, 2)} + {formatNumber(critFuzzyWeights[i].u, 2)}) / 3
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            <Typography variant="h6" sx={{ p: 2, pb: 1, bgcolor: '#e3f2fd', mt: 2 }}>Таблиця 6. Нормалізовані ваги (N)</Typography>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>Критерій</TableCell>
                        <TableCell align="center">N (Normalized)</TableCell>
                        <TableCell align="center">Формула (M / &sum; M)</TableCell>
                        <TableCell align="center">Сума (&sum; N)</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {criteriaNames.map((name, i) => (
                        <TableRow key={i} sx={{ bgcolor: '#e3f2fd' }}>
                            <TableCell>{name}</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 'bold' }}>{formatNumber(critNormWeights[i])}</TableCell>
                            <TableCell align="center">{formatNumber(critDefuzzified[i], 4)} / {formatNumber(sumCritDefuzz, 4)}</TableCell>
                            <TableCell align="center">{i === 0 ? formatNumber(critNormWeights.reduce((a, b) => a + b, 0)) : ''}</TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </TableContainer>
    );
};

const TableAltNormalizedWeights: React.FC<{
    criteriaName: string;
    altNames: string[];
    matrix: MatrixCell[][];
    localWeights: number[];
    critIndex: number;
}> = ({ criteriaName, altNames, matrix, localWeights, critIndex }) => {
    const geoMeans = matrix.map(row => fuzzyGeoMean(row.map(c => c.tri)));
    const sumGeo = fuzzySum(geoMeans);
    const invSum = fuzzyInverse(sumGeo);
    const fuzzyWeights = geoMeans.map(r => fuzzyMultiply(r, invSum));
    const defuzzified = fuzzyWeights.map(w => centerOfArea(w));

    return (
        <TableContainer component={Paper} sx={{ mb: 3 }} key={critIndex}>
            <Typography variant="h6" sx={{ p: 2, pb: 1, bgcolor: '#f3e5f5' }}>
                Критерій: {criteriaName} (Таблиці: {7 + 5*critIndex} - {11 + 5*critIndex})
            </Typography>
            <Table size="small">
                <TableHead>
                    <TableRow>
                        <TableCell>Альтернатива</TableCell>
                        <TableCell align="center">r (Geo Mean)</TableCell>
                        <TableCell align="center">w (Fuzzy Weight)</TableCell>
                        <TableCell align="center">M (Defuzzified)</TableCell>
                        <TableCell align="center">N (Normalized)</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {altNames.map((name, i) => (
                        <TableRow key={i} sx={{ bgcolor: i % 2 ? '#fafafa' : 'inherit' }}>
                            <TableCell>{name}</TableCell>
                            <TableCell align="center">{formatTri(geoMeans[i], 4)}</TableCell>
                            <TableCell align="center">{formatTri(fuzzyWeights[i], 4)}</TableCell>
                            <TableCell align="center">{formatNumber(defuzzified[i], 4)}</TableCell>
                            <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: '#e3f2fd' }}>{formatNumber(localWeights[i], 4)}</TableCell>
                        </TableRow>
                    ))}
                    <TableRow sx={{ bgcolor: '#fff3e0' }}>
                        <TableCell colSpan={5}>
                            <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                Vector Sum (sr): {formatTri(sumGeo, 4)} | Inversion Vector (isr): {formatTri(invSum, 4)}
                            </Typography>
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>
        </TableContainer>
    );
};

const TableAltWeightsCombined: React.FC<{
    criteriaNames: string[];
    altNames: string[];
    critNormWeights: number[];
    altLocalWeights: number[][];
    globalScores: number[];
}> = ({ criteriaNames, altNames, critNormWeights, altLocalWeights, globalScores }) => (
    <TableContainer component={Paper} sx={{ mb: 3 }}>
        <Typography variant="h6" sx={{ p: 2, pb: 1, bgcolor: '#e3f2fd' }}>Таблиця 32 & 33. Фінальні результати</Typography>
        <Table size="small">
            <TableHead>
                <TableRow>
                    <TableCell rowSpan={2}>Критерій</TableCell>
                    <TableCell rowSpan={2} align="center">Ваги N (Таблиця 6)</TableCell>
                    <TableCell colSpan={altNames.length} align="center">Ваги альтернатив N (Таблиця 32)</TableCell>
                </TableRow>
                <TableRow>
                    {altNames.map((name, i) => (
                       <TableCell key={i} align="center">{name}</TableCell>
                    ))}
                </TableRow>
            </TableHead>
            <TableBody>
                {criteriaNames.map((cName, cIdx) => (
                    <TableRow key={cIdx}>
                        <TableCell>{cName}</TableCell>
                        <TableCell align="center">{formatNumber(critNormWeights[cIdx], 4)}</TableCell>
                        {altNames.map((_, aIdx) => (
                           <TableCell key={aIdx} align="center">{formatNumber(altLocalWeights[cIdx][aIdx], 4)}</TableCell>
                        ))}
                    </TableRow>
                ))}
                <TableRow sx={{ bgcolor: '#e0f7fa' }}>
                    <TableCell colSpan={2} sx={{ fontWeight: 'bold' }}>Total Score (S) - Таблиця 33</TableCell>
                    {altNames.map((_, aIdx) => (
                       <TableCell key={aIdx} align="center" sx={{ fontWeight: 'bold' }}>{formatNumber(globalScores[aIdx], 4)}</TableCell>
                    ))}
                </TableRow>
                <TableRow>
                     <TableCell colSpan={5}>
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            Приклад розрахунку S<sub>1</sub> (Company A) за формулою S = &sum; N<sub>j</sub> &middot; N<sub>1j</sub> : {criteriaNames.map((_, cIdx) => `${formatNumber(critNormWeights[cIdx], 4)} \u00B7 ${formatNumber(altLocalWeights[cIdx][0], 4)}`).join(' + ')} = {formatNumber(globalScores[0], 4)}
                        </Typography>
                     </TableCell>
                </TableRow>
            </TableBody>
        </Table>
    </TableContainer>
  );


// --- Main Application ---

function App() {
  const [terms, setTerms] = useState<LinguisticTerm[]>(DEFAULT_TERMS);
  const [criteriaNames, setCriteriaNames] = useState<string[]>(INITIAL_CRITERIA_NAMES);
  const [altNames, setAltNames] = useState<string[]>(INITIAL_ALT_NAMES);
  
  const [activeTab, setActiveTab] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);

  const [critMatrix, setCritMatrix] = useState<MatrixCell[][]>(() => getInitialCritMatrixState());
  const [altMatrices, setAltMatrices] = useState<MatrixCell[][][]>(() => getInitialAltMatricesState());

  // Derived counts
  const numCriteria = criteriaNames.length;
  const numAlternatives = altNames.length;

  // --- Dynamic Add/Delete Logic ---
  
  const handleAddCriterion = () => {
    const newCritName = `Критерій ${numCriteria + 1}`;
    setCriteriaNames(prev => [...prev, newCritName]);

    // Resize Crit Matrix: Add row and col
    setCritMatrix(prev => {
        const size = prev.length;
        const newRow = Array(size + 1).fill(null).map(() => ({ tri: T_ONE, isInverse: false, saatyValue: 1 }));
        const newMat = prev.map(row => [...row, { tri: T_ONE, isInverse: false, saatyValue: 1 }]);
        newMat.push(newRow);
        return newMat;
    });

    // Add a new Matrix for this criterion in AltMatrices
    setAltMatrices(prev => [...prev, getInitialMatrix(numAlternatives, terms)]);
  };

  const handleDeleteCriterion = (index: number) => {
    if (numCriteria <= 2) return;
    setCriteriaNames(prev => prev.filter((_, i) => i !== index));

    setCritMatrix(prev => {
        const newMat = prev.filter((_, r) => r !== index).map(row => row.filter((_, c) => c !== index));
        return newMat;
    });

    setAltMatrices(prev => prev.filter((_, i) => i !== index));
  };

  const handleAddAlternative = () => {
      const newAltName = `Альтернатива ${numAlternatives + 1}`;
      setAltNames(prev => [...prev, newAltName]);

      // Resize EVERY Alt Matrix: Add row and col to each
      setAltMatrices(prev => prev.map(mat => {
          const size = mat.length;
          const newRow = Array(size + 1).fill(null).map(() => ({ tri: T_ONE, isInverse: false, saatyValue: 1 }));
          const newMat = mat.map(row => [...row, { tri: T_ONE, isInverse: false, saatyValue: 1 }]);
          newMat.push(newRow);
          return newMat;
      }));
  };

  const handleDeleteAlternative = (index: number) => {
      if (numAlternatives <= 2) return;
      setAltNames(prev => prev.filter((_, i) => i !== index));

      // Resize EVERY Alt Matrix: Remove row/col at index
      setAltMatrices(prev => prev.map(mat => {
          return mat.filter((_, r) => r !== index).map(row => row.filter((_, c) => c !== index));
      }));
  };


  const handleCritMatrixChange = (r: number, c: number, val: number) => {
    const termTri = getTriForValue(val, terms);
    const newMat = [...critMatrix.map(row => [...row])];
    newMat[r][c] = { tri: termTri, isInverse: val < 1, saatyValue: val };
    newMat[c][r] = { tri: fuzzyInverse(termTri), isInverse: true, saatyValue: 1/val };
    setCritMatrix(newMat);
  };

  const handleAltMatrixChange = (critIdx: number, r: number, c: number, val: number) => {
    const termTri = getTriForValue(val, terms);
    const newMatrices = [...altMatrices];
    const newMat = newMatrices[critIdx].map(row => [...row]);
    newMat[r][c] = { tri: termTri, isInverse: val < 1, saatyValue: val };
    newMat[c][r] = { tri: fuzzyInverse(termTri), isInverse: true, saatyValue: 1/val };
    newMatrices[critIdx] = newMat;
    setAltMatrices(newMatrices);
  };

  const handleReset = () => {
    setTerms(DEFAULT_TERMS);
    setCriteriaNames(INITIAL_CRITERIA_NAMES);
    setAltNames(INITIAL_ALT_NAMES);
    setCritMatrix(() => getInitialCritMatrixState());
    setAltMatrices(() => getInitialAltMatricesState());
    setActiveTab(0);
  };

  const results = useMemo(() => {
    if (critMatrix.length !== numCriteria || altMatrices.length !== numCriteria) return null;
    // Safety check for inner dimensions
    if (altMatrices.some(m => m.length !== numAlternatives)) return null;

    // 1. Process Criteria
    const critGeoMeans = critMatrix.map(row => fuzzyGeoMean(row.map(c => c.tri)));
    const sumCritGeoMeans = fuzzySum(critGeoMeans);
    const invSumCrit = fuzzyInverse(sumCritGeoMeans);
    const critFuzzyWeights = critGeoMeans.map(r => fuzzyMultiply(r, invSumCrit));
    const critDefuzzified = critFuzzyWeights.map(w => centerOfArea(w));
    const sumCritDefuzz = critDefuzzified.reduce((a, b) => a + b, 0);
    const critNormWeights = critDefuzzified.map(v => sumCritDefuzz !== 0 ? v / sumCritDefuzz : 0);

    // 2. Process Alternatives
    const altLocalWeights: number[][] = [];
    altMatrices.forEach((mat) => {
        const geoMeans = mat.map(row => fuzzyGeoMean(row.map(c => c.tri)));
        const sumGeo = fuzzySum(geoMeans);
        const invSum = fuzzyInverse(sumGeo);
        const fuzzyWeights = geoMeans.map(r => fuzzyMultiply(r, invSum));
        const defuzzified = fuzzyWeights.map(w => centerOfArea(w));
        const sumDefuzz = defuzzified.reduce((a, b) => a + b, 0);
        const normalized = defuzzified.map(v => sumDefuzz !== 0 ? v / sumDefuzz : 0);
        altLocalWeights.push(normalized);
    });

    // 3. Global Scores
    const globalScores = altNames.map((_, altIdx) => {
        let score = 0;
        for (let cIdx = 0; cIdx < numCriteria; cIdx++) {
            const critWeight = critNormWeights[cIdx] || 0;
            const altWeight = altLocalWeights[cIdx][altIdx] || 0;
            score += critWeight * altWeight;
        }
        return score;
    });

    const ranked = globalScores
        .map((score, idx) => ({ name: altNames[idx], score, idx }))
        .sort((a, b) => b.score - a.score);

    return {
        critGeoMeans, sumCritGeoMeans, invSumCrit, critFuzzyWeights, critNormWeights, altLocalWeights, globalScores, ranked
    };
  }, [critMatrix, altMatrices, numCriteria, numAlternatives, altNames]);


  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppBar position="static" color="default" elevation={1}>
        <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
           <Typography variant="h5" color="primary" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
             <InfoOutlinedIcon /> Fuzzy AHP
           </Typography>
           <Button startIcon={<RestartAltIcon />} color="error" onClick={handleReset}>Скинути дані</Button>
        </Box>
        <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} centered>
          <Tab label="1. Налаштування" />
          <Tab label="2. Порівняння Критеріїв" />
          <Tab label="3. Порівняння Альтернатив" />
          <Tab label="4. Кроки Розрахунку" />
        </Tabs>
      </AppBar>

      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        
        {/* TAB 0: SETUP */}
        {activeTab === 0 && (
          <Stack spacing={3}>
             <Paper sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="h6">Параметри задачі</Typography>
                  <Button startIcon={<EditIcon />} variant="outlined" onClick={() => setModalOpen(true)}>Редагувати терми</Button>
                </Box>
                
                <Grid container spacing={4}>
                   <Grid>
                      <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>Критерії ({numCriteria})</Typography>
                      {criteriaNames.map((name, idx) => (
                         <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                            <TextField fullWidth size="small" value={name} onChange={(e) => {
                                 const newNames = [...criteriaNames];
                                 newNames[idx] = e.target.value;
                                 setCriteriaNames(newNames);
                              }}
                              label={`Критерій ${idx + 1}`}
                            />
                            <IconButton color="error" onClick={() => handleDeleteCriterion(idx)} disabled={numCriteria <= 2}>
                                <DeleteIcon />
                            </IconButton>
                        </Box>
                      ))}
                      <Button startIcon={<AddIcon />} variant="outlined" onClick={handleAddCriterion} sx={{ mt: 1 }}>Додати критерій</Button>
                   </Grid>
                   <Grid>
                      <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>Альтернативи ({numAlternatives})</Typography>
                      {altNames.map((name, idx) => (
                        <Box key={idx} sx={{ display: 'flex', gap: 1, mb: 1 }}>
                            <TextField fullWidth size="small" value={name} onChange={(e) => {
                                 const newNames = [...altNames];
                                 newNames[idx] = e.target.value;
                                 setAltNames(newNames);
                              }}
                              label={`Альтернатива ${idx + 1}`}
                            />
                            <IconButton color="error" onClick={() => handleDeleteAlternative(idx)} disabled={numAlternatives <= 2}>
                                <DeleteIcon />
                            </IconButton>
                        </Box>
                      ))}
                      <Button startIcon={<AddIcon />} variant="outlined" onClick={handleAddAlternative} sx={{ mt: 1 }}>Додати альтернативу</Button>
                   </Grid>
                </Grid>
             </Paper>
             <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Button variant="contained" endIcon={<ArrowForwardIosIcon />} onClick={() => setActiveTab(1)}>Далі до порівняння Критеріїв</Button>
             </Box>
          </Stack>
        )}

        {/* TAB 1: CRITERIA MATRIX */}
        {activeTab === 1 && (
          <Stack spacing={2}>
             <PairwiseMatrixInput 
                title="Таблиця 2. Матриця попарних порівнянь Критеріїв"
                items={criteriaNames}
                matrix={critMatrix}
                onChange={handleCritMatrixChange}
                terms={terms}
             />
             <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Button startIcon={<ArrowBackIosNewIcon />} onClick={() => setActiveTab(0)}>Назад</Button>
                <Button variant="contained" endIcon={<ArrowForwardIosIcon />} onClick={() => setActiveTab(2)}>Далі до Альтернатив</Button>
             </Box>
          </Stack>
        )}

        {/* TAB 2: ALTERNATIVES MATRICES */}
        {activeTab === 2 && (
          <Stack spacing={4}>
             {criteriaNames.map((critName, cIdx) => (
                <PairwiseMatrixInput
                   key={cIdx}
                   title={`Таблиця ${7 + 5*cIdx}. Порівняння Альтернатив відносно критерію: ${critName}`}
                   items={altNames}
                   matrix={altMatrices[cIdx]}
                   onChange={(r, c, val) => handleAltMatrixChange(cIdx, r, c, val)}
                   terms={terms}
                />
             ))}
             <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Button startIcon={<ArrowBackIosNewIcon />} onClick={() => setActiveTab(1)}>Назад</Button>
                <Button variant="contained" endIcon={<PlayArrowIcon />} onClick={() => setActiveTab(3)}>Розрахувати та показати кроки</Button>
             </Box>
          </Stack>
        )}

        {/* TAB 3: RESULTS */}
        {activeTab === 3 && results && (
          <Stack spacing={3}>
             <Typography variant="h5" color="primary">Кроки Розрахунку (Steps 2-5)</Typography>
             <TableFuzzyWeights criteriaNames={criteriaNames} critGeoMeans={results.critGeoMeans} critFuzzyWeights={results.critFuzzyWeights} sumCritGeoMeans={results.sumCritGeoMeans} invSumCrit={results.invSumCrit} />
             <TableNormalizedWeights criteriaNames={criteriaNames} critFuzzyWeights={results.critFuzzyWeights} critNormWeights={results.critNormWeights} />
             <Typography variant="h6" color="primary" sx={{mt: 3}}>Ваги Альтернатив відносно Критеріїв (Steps 2-5 повторно)</Typography>
             {criteriaNames.map((critName, cIdx) => (
                <TableAltNormalizedWeights key={cIdx} criteriaName={critName} altNames={altNames} matrix={altMatrices[cIdx]} localWeights={results.altLocalWeights[cIdx]} critIndex={cIdx} />
             ))}
             <TableAltWeightsCombined criteriaNames={criteriaNames} altNames={altNames} critNormWeights={results.critNormWeights} altLocalWeights={results.altLocalWeights} globalScores={results.globalScores} />
             <Paper sx={{ p: 3, border: '2px solid #4caf50' }}>
                <Typography variant="h5" gutterBottom align="center" color="success.main">Фінальне Ранжування</Typography>
                <TableContainer>
                   <Table>
                      <TableHead>
                         <TableRow>
                            <TableCell align="center">Ранг</TableCell>
                            <TableCell>Альтернатива</TableCell>
                            <TableCell align="right">Глобальна Вага (Score)</TableCell>
                         </TableRow>
                      </TableHead>
                      <TableBody>
                         {results.ranked.map((item, idx) => (
                            <TableRow key={item.idx} hover sx={{ bgcolor: idx === 0 ? '#e8f5e9' : 'inherit' }}>
                               <TableCell align="center"><Typography variant="h4" color={idx === 0 ? 'success.main' : 'text.secondary'}>{idx + 1}</Typography></TableCell>
                               <TableCell><Typography variant="h6">{item.name}</Typography></TableCell>
                               <TableCell align="right"><Typography variant="h6" sx={{ fontWeight: 'bold' }}>{formatNumber(item.score)}</Typography></TableCell>
                            </TableRow>
                         ))}
                      </TableBody>
                   </Table>
                </TableContainer>
             </Paper>
             <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                <Button startIcon={<ArrowBackIosNewIcon />} onClick={() => setActiveTab(2)}>Назад до порівняння Альтернатив</Button>
             </Box>
          </Stack>
        )}
      </Container>
      <LinguisticTermEditor open={modalOpen} onClose={() => setModalOpen(false)} terms={terms} onSave={setTerms} />
    </ThemeProvider>
  );
}

export default App;