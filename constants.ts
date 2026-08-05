
export const PRODUCT_TYPES = [
  // --- CALÇADOS ---
  'Tênis Adulto Masculino',
  'Tênis Adulto Feminino',
  'Tênis Infantil Masculino',
  'Tênis Infantil Feminino',
  'Sapato Adulto Masculino',
  'Sapato Adulto Feminino',
  'Sapato Infantil Masculino',
  'Sapato Infantil Feminino',
  'Sapatênis Masculino',
  'Sapatênis Feminino',
  'Sapatênis Infantil Masculino',
  'Sapatênis Infantil Feminino',
  'Chinelo Masculino',
  'Chinelo Feminino',
  'Chinelo Infantil',
  'Sandália Masculina',
  'Sandália Feminina',
  'Sandália Infantil',
  'Tamanco',
  'Saltos',
  'Rasteirinhas',
  'Sapatilha Feminina Adulta',
  'Sapatilha Feminina Infantil',
  'Papetes Adulto',
  'Papetes Infantil',
  'Botas Masculinas',
  'Botas Femininas',
  'Botas Infantis',
  'Chuteira Futsal',
  'Chuteira Campo',
  'Chuteira Society',
  // --- CONFECÇÕES ---
  'Camisetas Masculinas',
  'Camisetas Femininas',
  'Camisetas Infantis',
  'Camisas Masculinas',
  'Camisas Femininas',
  'Polo Masculina',
  'Polo Feminina',
  'Polo Infantil',
  'Calças Jeans Masculinas',
  'Calças Jeans Femininas',
  'Calças Jeans Infantis',
  'Bermudas Masculinas',
  'Bermudas Femininas',
  'Bermudas Infantis',
  'Shorts Masculinos',
  'Shorts Femininos',
  'Shorts Infantis',
  'Vestidos Adulto',
  'Vestidos Infantil',
  'Saias',
  'Lingerie',
  'Cuecas',
  'Moda Praia Masculina',
  'Moda Praia Feminina',
  'Moda Praia Infantil',
  'Moda Fitness Masculina',
  'Moda Fitness Feminina',
  // --- ACESSÓRIOS ---
  'Bolsas',
  'Cintos',
  'Relógios',
  'Acessórios em geral'
];

export const LETTER_SIZES = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XXG'];

export const NUMERIC_SIZES = [
  '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', 
  '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33', '34', '35', 
  '36', '37', '38', '39', '40', '41', '42', '43', '44', '45'
];

export const MONTHS = [
  '01', '02', '03', '04', '05', '06',
  '07', '08', '09', '10', '11', '12'
];

export const YEARS = Array.from({ length: 2030 - 2019 + 1 }, (_, i) => (2019 + i).toString());

export const getGenderFromProductType = (productType?: string, currentGender?: string): string => {
  if (!productType) return currentGender || 'M';
  const lower = productType.toLowerCase();
  if (lower.includes('infantil') && (lower.includes('masculin') || lower.includes('menino'))) return 'IM';
  if (lower.includes('infantil') && (lower.includes('feminin') || lower.includes('menina'))) return 'IF';
  if (lower.includes('masculin') || lower.includes('homem') || lower.includes('cueca') || lower.includes('sapatênis masculino')) return 'M';
  if (lower.includes('feminin') || lower.includes('mulher') || lower.includes('lingerie') || lower.includes('tamanco') || lower.includes('rasteirinha') || lower.includes('sapatilha')) return 'F';
  return currentGender || 'M';
};

export const getDefaultProductTypeFromGender = (gender?: string, currentProductType?: string): string => {
  if (currentProductType && currentProductType !== 'Calçado Feminino' && currentProductType !== 'Calçado') {
    if (getGenderFromProductType(currentProductType) === gender) {
      return currentProductType;
    }
  }
  switch (gender) {
    case 'M':
      return 'Tênis Adulto Masculino';
    case 'IM':
      return 'Tênis Infantil Masculino';
    case 'IF':
      return 'Tênis Infantil Feminino';
    case 'F':
      return 'Tênis Adulto Feminino';
    default:
      return 'Tênis Adulto Masculino';
  }
};

export const syncProductTypeWithGender = (currentProductType: string | undefined, newGender: string): string => {
  if (!newGender) return currentProductType || 'Tênis Adulto Masculino';
  if (!currentProductType || currentProductType === 'Calçado' || currentProductType === 'Calçado Feminino') {
    return getDefaultProductTypeFromGender(newGender);
  }

  // If already aligned with new gender, return currentProductType
  if (getGenderFromProductType(currentProductType) === newGender) {
    return currentProductType;
  }

  // Convert string to match new gender
  let updated = currentProductType;
  if (newGender === 'F') {
    updated = updated
      .replace(/Infantil/gi, 'Adulto')
      .replace(/Masculino/gi, 'Feminino')
      .replace(/Masculina/gi, 'Feminina')
      .replace(/Masculinas/gi, 'Femininas')
      .replace(/Masculinos/gi, 'Femininos');
  } else if (newGender === 'M') {
    updated = updated
      .replace(/Infantil/gi, 'Adulto')
      .replace(/Feminino/gi, 'Masculino')
      .replace(/Feminina/gi, 'Masculina')
      .replace(/Femininas/gi, 'Masculinas')
      .replace(/Femininos/gi, 'Masculinos');
  } else if (newGender === 'IM') {
    updated = updated
      .replace(/Adulto/gi, 'Infantil')
      .replace(/Feminino/gi, 'Masculino')
      .replace(/Feminina/gi, 'Masculina')
      .replace(/Femininas/gi, 'Masculinas')
      .replace(/Femininos/gi, 'Masculinos');
  } else if (newGender === 'IF') {
    updated = updated
      .replace(/Adulto/gi, 'Infantil')
      .replace(/Masculino/gi, 'Feminino')
      .replace(/Masculina/gi, 'Feminina')
      .replace(/Femininas/gi, 'Masculinas')
      .replace(/Masculinos/gi, 'Femininos');
  }

  if (PRODUCT_TYPES.includes(updated) && getGenderFromProductType(updated) === newGender) {
    return updated;
  }

  return getDefaultProductTypeFromGender(newGender);
};

export const getDefaultSizesArray = (gridType?: string, gender?: string, productType?: string): string[] => {
  if (gridType === 'LETTER') {
    return LETTER_SIZES;
  }
  const isInfantil = gender === 'IM' || gender === 'IF' || (productType || '').toLowerCase().includes('infantil');
  if (isInfantil) {
    return NUMERIC_SIZES.filter(s => { const n = parseInt(s, 10); return n >= 14 && n <= 37; });
  }
  const isMasculino = gender === 'M' || (productType || '').toLowerCase().includes('masculin');
  if (isMasculino) {
    return NUMERIC_SIZES.filter(s => { const n = parseInt(s, 10); return n >= 34 && n <= 45; });
  }
  const isFeminino = gender === 'F' || (productType || '').toLowerCase().includes('feminin');
  if (isFeminino) {
    return NUMERIC_SIZES.filter(s => { const n = parseInt(s, 10); return n >= 33 && n <= 41; });
  }
  return NUMERIC_SIZES.filter(s => { const n = parseInt(s, 10); return n >= 33 && n <= 44; });
};
