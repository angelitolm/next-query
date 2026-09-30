'use server'
import { revalidate } from '@angelitolm/next-query'
import { renameProduct } from '../../lib/db'

export async function rename(id: string, form: FormData) {
  await renameProduct(id, String(form.get('name') ?? ''))
  revalidate('products') // the list and every product page
}
