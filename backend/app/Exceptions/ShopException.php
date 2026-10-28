<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * A business-rule failure with a message that is safe to show to the user (French).
 * Rendered as a 422 JSON response by the API layer.
 */
class ShopException extends RuntimeException {}
