<?php

it('answers the ping route', function () {
    $this->getJson('/api/ping')->assertOk()->assertJson(['pong' => true]);
});
