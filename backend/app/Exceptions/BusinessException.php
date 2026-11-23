<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/**
 * A business rule was broken (not enough stock, wrong order status…).
 * Rendered as JSON with a readable message the frontend can show as-is.
 */
class BusinessException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly string $errorCode = 'business_rule',
        public readonly int $status = 422,
        public readonly array $context = [],
    ) {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'message' => $this->getMessage(),
            'code' => $this->errorCode,
            'context' => (object) $this->context,
        ], $this->status);
    }
}
