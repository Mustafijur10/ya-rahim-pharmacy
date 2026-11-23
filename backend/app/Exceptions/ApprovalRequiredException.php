<?php

namespace App\Exceptions;

/** The user may ask for this, but a manager (or pharmacist) must approve it first. */
class ApprovalRequiredException extends BusinessException
{
    public function __construct(string $message, string $approvalType, array $context = [])
    {
        parent::__construct($message, 'approval_required', 403, ['approval_type' => $approvalType] + $context);
    }
}
