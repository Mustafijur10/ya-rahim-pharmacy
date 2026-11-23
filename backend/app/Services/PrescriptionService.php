<?php

namespace App\Services;

use App\Exceptions\BusinessException;
use App\Models\Customer;
use App\Models\Prescription;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Prescription images are medical records: they are stored on the private "local" disk
 * (never public) and only served to staff and the owning customer through the API.
 */
class PrescriptionService
{
    public const DISK = 'local';

    public const MAX_PAGES = 5;

    public const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

    /** @param  list<UploadedFile>  $files */
    public function upload(array $files, ?Customer $customer, ?User $uploadedBy = null, bool $saveForRefill = false): Prescription
    {
        if ($files === [] || count($files) > self::MAX_PAGES) {
            throw new BusinessException('Upload between 1 and '.self::MAX_PAGES.' pages.');
        }
        foreach ($files as $file) {
            if (! in_array($file->getMimeType(), self::ALLOWED_MIMES, true)) {
                throw new BusinessException('Prescriptions must be JPG, PNG, WEBP or PDF files.');
            }
        }

        $stored = [];
        try {
            return DB::transaction(function () use ($files, $customer, $uploadedBy, $saveForRefill, &$stored) {
                $prescription = Prescription::create([
                    'customer_id' => $customer?->id,
                    'uploaded_by' => $uploadedBy?->id,
                    'status' => 'pending',
                    'save_for_refill' => $saveForRefill,
                ]);

                foreach (array_values($files) as $i => $file) {
                    $path = $file->storeAs(
                        'prescriptions/'.now()->format('Y/m'),
                        $prescription->id.'-'.($i + 1).'-'.Str::random(16).'.'.$file->extension(),
                        self::DISK,
                    );
                    $stored[] = $path;

                    $prescription->pages()->create([
                        'disk' => self::DISK,
                        'path' => $path,
                        'original_name' => Str::limit($file->getClientOriginalName(), 200, ''),
                        'mime' => $file->getMimeType(),
                        'size' => $file->getSize(),
                        'sort_order' => $i,
                    ]);
                }

                return $prescription->load('pages');
            });
        } catch (\Throwable $e) {
            Storage::disk(self::DISK)->delete($stored);
            throw $e;
        }
    }
}
