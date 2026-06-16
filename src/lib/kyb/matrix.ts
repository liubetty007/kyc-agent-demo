import matrix from '../../../config/kyb-document-matrix.json';
import type { MatrixConfig } from './types';

export function getMatrix(): MatrixConfig {
  return matrix as MatrixConfig;
}
