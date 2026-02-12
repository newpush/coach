.PHONY: dev clean

dev:
	@mkdir -p logs
	pnpm run dev 2>&1 | tee ./logs/dev.log

clean:
	rm -rf .nuxt
