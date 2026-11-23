<?php

namespace Tests\Feature\Api;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PosQuoteApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedBasics();
    }

    public function test_quote_matches_the_sale_across_two_batches_with_discount(): void
    {
        $cashier = $this->staff('cashier');
        $this->openShift($cashier);
        $med = $this->medicine(['name' => 'Seclo', 'discount_percent' => 8]); // online discount must NOT apply at the counter
        $this->batch($med, 15, '+2 months', mrp: 5.5);  // older batch, cheaper
        $this->batch($med, 100, '+1 year', mrp: 6);
        $this->actingAs($cashier);

        $items = [['medicine_id' => $med->id, 'quantity' => 2]]; // 2 strips = 20 caps: 15 @5.5 + 5 @6
        $quote = $this->postJson('/api/admin/pos/quote', ['items' => $items, 'discount_percent' => 5])
            ->assertOk()
            ->assertJsonPath('max_cashier_discount', 5)
            ->json();

        $this->assertEquals(112.5, $quote['subtotal']);           // 82.5 + 30
        $this->assertEquals(5.63, $quote['discount_total']);       // 4.13 + 1.50 (rounded per batch, like the sale)

        $sale = $this->postJson('/api/admin/pos/sales', [
            'items' => $items,
            'discount_percent' => 5,
            'payments' => [['method' => 'cash', 'amount' => $quote['total'], 'received_amount' => 200]],
        ])->assertCreated()->json('data');

        $this->assertEquals($quote['total'], $sale['total']);
        $this->assertCount(2, $sale['items'], 'One line per batch');
    }
}
