import { db, doc, updateDoc, handleFirestoreError, OperationType } from './firebase';
import { Product, Store } from '../types';

export const DEFAULT_PRESET_CATEGORIES: string[] = [
  'Grain',
  'Biscuit',
  'Oil',
  'Ghee',
  'Tea',
  'Toys',
  'Detergent',
  'Soap',
  'Laundry',
  'General',
  'Grocery',
  'Dairy',
  'Beverages',
  'Snacks',
  'Bakery',
  'Spices',
  'Personal Care',
  'Fruits & Vegetables'
];

/**
 * Returns a deduplicated array of all available categories:
 * Default presets + Store custom categories + Any category used in products.
 */
export function getAllCategories(store?: Store | null, products?: Product[]): string[] {
  const set = new Set<string>();

  // 1. Add Default Presets
  DEFAULT_PRESET_CATEGORIES.forEach(c => {
    if (c?.trim()) set.add(c.trim());
  });

  // 2. Add Store Custom Categories
  if (store?.customCategories && Array.isArray(store.customCategories)) {
    store.customCategories.forEach(c => {
      if (c?.trim()) set.add(c.trim());
    });
  }

  // 3. Add Existing Product Categories
  if (products && Array.isArray(products)) {
    products.forEach(p => {
      if (p.category?.trim()) set.add(p.category.trim());
    });
  }

  return Array.from(set);
}

/**
 * Saves a new custom category to the store in Firestore.
 */
export async function saveNewCategoryToStore(storeId: string, currentCustom: string[] = [], newCategory: string): Promise<string[]> {
  const trimmed = newCategory.trim();
  if (!trimmed) return currentCustom;

  // Check if already in list
  if (currentCustom.some(c => c.toLowerCase() === trimmed.toLowerCase())) {
    return currentCustom;
  }

  const updated = [...currentCustom, trimmed];
  try {
    const storeRef = doc(db, 'stores', storeId);
    await updateDoc(storeRef, {
      customCategories: updated
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `stores/${storeId}`);
  }

  return updated;
}

/**
 * Convenient wrapper returning status and message for adding custom category.
 */
export async function addCustomCategoryToStore(
  storeId: string,
  newCategory: string,
  currentCustom: string[] = []
): Promise<{ success: boolean; categories: string[]; error?: string }> {
  const trimmed = newCategory.trim();
  if (!trimmed) {
    return { success: false, categories: currentCustom, error: 'Category name is required.' };
  }
  try {
    const updated = await saveNewCategoryToStore(storeId, currentCustom, trimmed);
    return { success: true, categories: updated };
  } catch (err: any) {
    return { success: false, categories: currentCustom, error: err?.message || 'Failed to save category.' };
  }
}
